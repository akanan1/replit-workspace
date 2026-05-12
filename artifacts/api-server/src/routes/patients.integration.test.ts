import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { getDb, patientsTable } from "@workspace/db";
import app from "../app";
import {
  createTestUser,
  resetTestDb,
  teardownTestDb,
} from "../../test/helpers";

const EMAIL = "patients@halonote.test";
const PASSWORD = "correct horse battery staple";

async function loginAgent() {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  const cookies = res.headers["set-cookie"] as unknown as string[];
  const csrf = cookies.find((c) => c.startsWith("halonote_csrf="))!;
  const csrfToken = csrf.split("=")[1]!.split(";")[0]!;
  return { agent, csrfToken };
}

describe("POST /patients (integration)", () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    await createTestUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: "Patients User",
    });
  });

  it("creates a patient with auto-generated pt_<uuid> id", async () => {
    const { agent, csrfToken } = await loginAgent();
    const res = await agent
      .post("/api/patients")
      .set("X-CSRF-Token", csrfToken)
      .send({
        firstName: "Jane",
        lastName: "Doe",
        dateOfBirth: "1985-04-12",
        mrn: "MRN-NEW-1",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^pt_/);
    expect(res.body).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1985-04-12",
      mrn: "MRN-NEW-1",
    });

    // Round-trip through the DB.
    const [row] = await getDb()
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, res.body.id as string));
    expect(row?.firstName).toBe("Jane");
  });

  it("returns 409 on duplicate MRN", async () => {
    const { agent, csrfToken } = await loginAgent();
    const body = {
      firstName: "First",
      lastName: "Owner",
      dateOfBirth: "1990-01-01",
      mrn: "MRN-DUP",
    };
    const first = await agent
      .post("/api/patients")
      .set("X-CSRF-Token", csrfToken)
      .send(body);
    expect(first.status).toBe(201);

    const second = await agent
      .post("/api/patients")
      .set("X-CSRF-Token", csrfToken)
      .send({ ...body, firstName: "Second" });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: "mrn_already_exists" });
  });

  it("rejects an invalid dateOfBirth with 400", async () => {
    const { agent, csrfToken } = await loginAgent();
    const res = await agent
      .post("/api/patients")
      .set("X-CSRF-Token", csrfToken)
      .send({
        firstName: "Bad",
        lastName: "Date",
        dateOfBirth: "April 12, 1985",
        mrn: "MRN-BAD",
      });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated POST with 401", async () => {
    const res = await request(app)
      .post("/api/patients")
      .send({
        firstName: "x",
        lastName: "y",
        dateOfBirth: "1990-01-01",
        mrn: "MRN-NOAUTH",
      });
    expect(res.status).toBe(401);
  });
});
