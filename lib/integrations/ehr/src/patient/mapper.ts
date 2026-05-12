import type { Patient as FhirPatient } from "../fhir/types";

/**
 * Shape an app expects when persisting an EHR-sourced patient. Matches
 * the columns on the `patients` table in @workspace/db, but kept here
 * so the mapping logic lives next to the FHIR types rather than in the
 * api-server.
 */
export interface MappedPatient {
  firstName: string;
  lastName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  /** Medical Record Number — chosen from Patient.identifier. */
  mrn: string;
}

export class PatientMappingError extends Error {
  override readonly name = "PatientMappingError";
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Distill a FHIR Patient into the four fields HaloNote stores.
 *
 * Identifier selection prefers MR-coded identifiers (terminology
 * binding http://terminology.hl7.org/CodeSystem/v2-0203 / code "MR")
 * because that's what most EHRs tag the MRN with. Falls back to the
 * first identifier with a non-empty `value`.
 *
 * Throws PatientMappingError when a required field is missing — the
 * api-server surfaces that as a 4xx so the caller knows it can't
 * safely persist an incomplete row.
 */
export function mapFhirPatient(p: FhirPatient): MappedPatient {
  const name = pickName(p.name ?? []);
  if (!name) {
    throw new PatientMappingError(
      `Patient/${p.id ?? "?"} has no usable name`,
    );
  }
  if (!p.birthDate) {
    throw new PatientMappingError(
      `Patient/${p.id ?? "?"} has no birthDate`,
    );
  }
  const mrn = pickMrn(p.identifier ?? []);
  if (!mrn) {
    throw new PatientMappingError(
      `Patient/${p.id ?? "?"} has no identifier with a value`,
    );
  }
  return {
    firstName: name.first,
    lastName: name.last,
    dateOfBirth: p.birthDate,
    mrn,
  };
}

function pickName(
  names: NonNullable<FhirPatient["name"]>,
): { first: string; last: string } | null {
  // Prefer official → usual → first non-empty entry.
  const ordered = [
    ...names.filter((n) => n.use === "official"),
    ...names.filter((n) => n.use === "usual"),
    ...names.filter((n) => !n.use),
    ...names,
  ];
  for (const n of ordered) {
    const last = n.family?.trim();
    const first = n.given?.[0]?.trim();
    if (last && first) return { first, last };
  }
  return null;
}

function pickMrn(
  identifiers: NonNullable<FhirPatient["identifier"]>,
): string | null {
  const isMrCoded = (
    id: NonNullable<FhirPatient["identifier"]>[number],
  ): boolean =>
    id.type?.coding?.some(
      (c) =>
        c.system ===
          "http://terminology.hl7.org/CodeSystem/v2-0203" && c.code === "MR",
    ) ?? false;

  const ordered = [
    ...identifiers.filter(isMrCoded),
    ...identifiers.filter((i) => i.use === "official"),
    ...identifiers,
  ];
  for (const id of ordered) {
    const v = id.value?.trim();
    if (v) return v;
  }
  return null;
}
