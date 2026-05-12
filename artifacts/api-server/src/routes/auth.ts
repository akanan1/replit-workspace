import { randomUUID } from "node:crypto";
import { Router, type CookieOptions, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  ConfirmPasswordResetBody,
  LoginBody,
  RequestPasswordResetBody,
  SignupBody,
} from "@workspace/api-zod";
import { getDb, usersTable } from "@workspace/db";
import {
  createSession,
  destroySession,
  findUserByEmail,
  hashPassword,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyPassword,
} from "../lib/auth";
import {
  CSRF_COOKIE,
  generateCsrfToken,
  setCsrfCookie,
} from "../lib/csrf";
import { sendEmail } from "../lib/email";
import {
  findValidResetToken,
  issuePasswordResetToken,
  markResetTokenUsed,
} from "../lib/password-reset";
import {
  loginEmailRateLimit,
  loginIpRateLimit,
} from "../middlewares/login-rate-limit";
import {
  passwordResetEmailRateLimit,
  passwordResetIpRateLimit,
  signupIpRateLimit,
} from "../middlewares/password-reset-rate-limit";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

function cookieOptions(): CookieOptions {
  const isProd = process.env["NODE_ENV"] === "production";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

async function startSession(
  res: import("express").Response,
  userId: string,
): Promise<void> {
  const session = await createSession(userId);
  res.cookie(SESSION_COOKIE, session.id, cookieOptions());
  setCsrfCookie(res, generateCsrfToken());
}

router.post(
  "/auth/signup",
  signupIpRateLimit,
  async (req, res) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    const displayName = parsed.data.displayName.trim();

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    try {
      const passwordHash = await hashPassword(parsed.data.password);
      const [user] = await getDb()
        .insert(usersTable)
        .values({
          id: `usr_${randomUUID()}`,
          email,
          displayName,
          passwordHash,
        })
        .returning();
      if (!user) throw new Error("Insert returned no row");

      await startSession(res, user.id);
      res.status(201).json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      // 23505 unique_violation can race past the findUserByEmail check
      // under concurrent signups for the same address.
      const e = err as { code?: unknown; cause?: { code?: unknown } };
      if (e.code === "23505" || e.cause?.code === "23505") {
        res.status(409).json({ error: "email_already_registered" });
        return;
      }
      req.log.error({ err }, "Failed to create user");
      res.status(500).json({ error: "persistence_failed" });
    }
  },
);

router.post(
  "/auth/password-reset/request",
  passwordResetIpRateLimit,
  passwordResetEmailRateLimit,
  async (req, res) => {
    const parsed = RequestPasswordResetBody.safeParse(req.body);
    // 204 even on validation failure — don't reveal what the server thinks
    // about the input. Reset abuse is bounded by the rate limiters above.
    if (!parsed.success) {
      res.status(204).end();
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    const user = await findUserByEmail(email);

    if (user) {
      const { raw } = await issuePasswordResetToken(user.id);
      const appBase = process.env["APP_BASE_URL"] ?? "http://localhost:5174";
      const link = `${appBase}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your HaloNote password",
        body:
          `Hi ${user.displayName},\n\n` +
          `Use this link to choose a new password. It's valid for 1 hour.\n\n` +
          `${link}\n\n` +
          `If you didn't ask for this, you can ignore the email.`,
      });
    }

    // Always 204, regardless of whether the email exists. User enumeration
    // defense — paired with the per-email + per-IP rate limiters above.
    res.status(204).end();
  },
);

router.post(
  "/auth/password-reset/confirm",
  passwordResetIpRateLimit,
  async (req, res) => {
    const parsed = ConfirmPasswordResetBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const token = await findValidResetToken(parsed.data.token);
    if (!token) {
      res.status(400).json({ error: "invalid_or_expired_token" });
      return;
    }

    try {
      const passwordHash = await hashPassword(parsed.data.password);
      const db = getDb();
      await db
        .update(usersTable)
        .set({ passwordHash })
        .where(eq(usersTable.id, token.userId));
      await markResetTokenUsed(token.id);

      // Auto-login: the act of clicking the email link proved access to
      // the inbox; making them sign in again is friction without value.
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, token.userId))
        .limit(1);
      if (!user) throw new Error("User vanished between update and select");

      await startSession(res, user.id);
      res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      req.log.error({ err }, "Password reset confirm failed");
      res.status(500).json({ error: "persistence_failed" });
    }
  },
);

router.post(
  "/auth/login",
  loginIpRateLimit,
  loginEmailRateLimit,
  async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const user = await findUserByEmail(parsed.data.email);
    // Compute a hash either way so timing doesn't leak whether an account exists.
    const ok = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    await startSession(res, user.id);
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  },
);

router.post("/auth/logout", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (typeof sid === "string" && sid.length > 0) {
    await destroySession(sid);
  }
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (!req.cookies?.[CSRF_COOKIE]) {
    setCsrfCookie(res, generateCsrfToken());
  }
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
});

export default router;
