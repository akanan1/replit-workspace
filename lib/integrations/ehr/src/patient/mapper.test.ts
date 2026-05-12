import { describe, expect, it } from "vitest";
import { mapFhirPatient, PatientMappingError } from "./mapper";
import type { Patient as FhirPatient } from "../fhir/types";

function patient(overrides: Partial<FhirPatient> = {}): FhirPatient {
  return {
    resourceType: "Patient",
    id: "ext-1",
    name: [{ family: "Doe", given: ["Jane"] }],
    birthDate: "1985-04-12",
    identifier: [{ value: "MRN-001" }],
    ...overrides,
  };
}

describe("mapFhirPatient", () => {
  it("maps a minimal patient", () => {
    expect(mapFhirPatient(patient())).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1985-04-12",
      mrn: "MRN-001",
    });
  });

  it("prefers official names over usual or unflagged ones", () => {
    const result = mapFhirPatient(
      patient({
        name: [
          { use: "nickname", family: "X", given: ["Nick"] },
          { use: "usual", family: "Smith", given: ["Will"] },
          { use: "official", family: "Smith", given: ["William"] },
        ],
      }),
    );
    expect(result.firstName).toBe("William");
    expect(result.lastName).toBe("Smith");
  });

  it("prefers an MR-coded identifier over the first listed one", () => {
    const result = mapFhirPatient(
      patient({
        identifier: [
          { value: "FOO-123" },
          {
            value: "MRN-XYZ",
            type: {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "MR",
                },
              ],
            },
          },
        ],
      }),
    );
    expect(result.mrn).toBe("MRN-XYZ");
  });

  it("throws when no name resolves", () => {
    expect(() =>
      mapFhirPatient(patient({ name: [{ given: ["First only"] }] })),
    ).toThrow(PatientMappingError);
  });

  it("throws when birthDate is missing", () => {
    expect(() => mapFhirPatient(patient({ birthDate: undefined }))).toThrow(
      PatientMappingError,
    );
  });

  it("throws when no identifier carries a value", () => {
    expect(() =>
      mapFhirPatient(patient({ identifier: [{ value: "" }] })),
    ).toThrow(PatientMappingError);
  });
});
