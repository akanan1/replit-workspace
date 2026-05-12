import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { createTestUser, resetTestDb, teardownTestDb } from "../../test/helpers";

// The per-email login limiter caps at 5 within a 15-minute window.
// Use a unique email so this test's bucket is independent of any other
// suite's failed-login churn.
const EMAIL = `ratelimit-${Date.now()}@halonote.test`;
const PASSWORD = "correct horse battery staple";

describe("/auth/login rate limit (integration)", () => {
  beforeAll(async () => {
    await resetTestDb();
    await createTestUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: "Rate Limit User",
    });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("returns 429 after 5 failed attempts for the same email", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .send({ email: EMAIL, password: "wrong" });
      expect(r.status).toBe(401);
    }

    const sixth = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "wrong" });
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({ error: "too_many_attempts" });
    // Retry-After header should be present and a positive integer.
    const retryAfter = Number(sixth.headers["retry-after"]);
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);

    // Even the correct password is locked out while the bucket is full —
    // attackers can't bypass the lockout by eventually guessing right.
    const correctButLocked = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(correctButLocked.status).toBe(429);
  });
});
