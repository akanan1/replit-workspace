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
import { getDb, passwordResetTokensTable } from "@workspace/db";
import app from "../app";
import {
  createTestUser,
  resetTestDb,
  teardownTestDb,
} from "../../test/helpers";
import { drainSentEmails, getLastEmailTo } from "../lib/email";
import { hashToken } from "../lib/password-reset";

const EMAIL = `reset-${Date.now()}@halonote.test`;
const PASSWORD = "correct horse battery staple";
const DISPLAY = "Reset User";

function tokenFromEmailBody(body: string): string {
  const m = body.match(/[?&]token=([^\s&]+)/);
  if (!m || !m[1]) throw new Error("No token= found in email body");
  return decodeURIComponent(m[1]);
}

describe("password reset flow (integration)", () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    drainSentEmails();
    await createTestUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY,
    });
  });

  it("request → email contains a reset link with a token; confirm sets new password", async () => {
    const requestRes = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: EMAIL });
    expect(requestRes.status).toBe(204);

    const email = getLastEmailTo(EMAIL);
    expect(email).toBeDefined();
    expect(email!.subject).toMatch(/reset/i);
    const token = tokenFromEmailBody(email!.body);
    expect(token.length).toBeGreaterThan(16);

    const newPassword = "a brand new strong password";
    const confirmRes = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token, password: newPassword });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.email).toBe(EMAIL);

    // The confirm response also starts a session.
    const cookies = confirmRes.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("halonote_session="))).toBe(true);

    // Old password no longer works…
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    // …and the new one does.
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  it("request for an unknown email still returns 204 and sends NO email", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: "ghost@nowhere.test" });
    expect(res.status).toBe(204);
    expect(getLastEmailTo("ghost@nowhere.test")).toBeUndefined();
  });

  it("confirm with a bad token returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: "definitely-not-a-real-token", password: "x".repeat(12) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_or_expired_token" });
  });

  it("confirm with an expired token returns 400", async () => {
    // Seed a token directly with expiresAt in the past.
    const rawToken = "expired-test-token-with-enough-entropy-xyz";
    const tokenHash = hashToken(rawToken);
    const user = await createTestUser({
      email: `expired-${Date.now()}@halonote.test`,
      password: PASSWORD,
      displayName: "Expired",
    });
    await getDb().insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: rawToken, password: "new long password" });
    expect(res.status).toBe(400);
  });

  it("a token can only be used once", async () => {
    await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: EMAIL });
    const email = getLastEmailTo(EMAIL);
    const token = tokenFromEmailBody(email!.body);

    const first = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token, password: "first new password" });
    expect(first.status).toBe(200);

    // Verify the row is marked used in the DB.
    const tokenHash = hashToken(token);
    const [row] = await getDb()
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash));
    expect(row?.usedAt).toBeInstanceOf(Date);

    const second = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token, password: "second new password" });
    expect(second.status).toBe(400);
  });
});
