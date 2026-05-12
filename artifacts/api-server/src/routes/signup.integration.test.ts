import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import request from "supertest";
import app from "../app";
import { resetTestDb, teardownTestDb } from "../../test/helpers";
import { drainSentEmails } from "../lib/email";

describe("POST /auth/signup (integration)", () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    drainSentEmails();
  });

  it("creates a new user and starts a session", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/signup").send({
      email: "new@halonote.test",
      password: "correct horse battery staple",
      displayName: "New Provider",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "new@halonote.test",
      displayName: "New Provider",
    });
    expect(res.body.id).toMatch(/^usr_/);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("halonote_session="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("halonote_csrf="))).toBe(true);

    // Auto-login proved: /auth/me with the agent's cookies returns the user.
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("new@halonote.test");
  });

  it("normalizes email to lowercase", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      email: "MixedCase@HaloNote.Test",
      password: "long enough password",
      displayName: "Casey",
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("mixedcase@halonote.test");
  });

  it("rejects a duplicate email with 409", async () => {
    const body = {
      email: "dup@halonote.test",
      password: "long enough password",
      displayName: "First",
    };
    const first = await request(app).post("/api/auth/signup").send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/auth/signup")
      .send({ ...body, displayName: "Second" });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: "email_already_registered" });
  });

  it("rejects a too-short password with 400", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      email: "shorty@halonote.test",
      password: "abc",
      displayName: "Shorty",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      email: "not-an-email",
      password: "long enough password",
      displayName: "Bad Email",
    });
    expect(res.status).toBe(400);
  });
});
