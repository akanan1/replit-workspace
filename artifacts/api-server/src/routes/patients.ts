import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { CreatePatientBody, ListPatientsResponse } from "@workspace/api-zod";
import { getDb, patientsTable } from "@workspace/db";
import { listPatients } from "../lib/patients";

const router: IRouter = Router();

router.get("/patients", async (_req, res) => {
  const patients = await listPatients();
  const payload = ListPatientsResponse.parse({ data: patients });
  res.json(payload);
});

router.post("/patients", async (req, res) => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const inserted = await getDb()
      .insert(patientsTable)
      .values({
        id: `pt_${randomUUID()}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        dateOfBirth: parsed.data.dateOfBirth,
        mrn: parsed.data.mrn,
      })
      .returning();
    const patient = inserted[0];
    if (!patient) throw new Error("Insert returned no row");

    res.status(201).json({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      mrn: patient.mrn,
    });
  } catch (err) {
    // 23505 = Postgres unique_violation. mrn is the only unique column
    // on patients (the id is auto-generated), so we treat any 23505 as a
    // duplicate MRN. Drizzle sometimes wraps the pg error in `cause`,
    // so check both top-level and wrapped.
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "mrn_already_exists" });
      return;
    }
    req.log.error({ err }, "Failed to insert patient");
    res.status(500).json({ error: "persistence_failed" });
  }
});

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505") {
    return true;
  }
  return false;
}

export default router;
