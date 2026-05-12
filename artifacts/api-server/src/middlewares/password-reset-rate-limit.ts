import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// Per-IP cap on password-reset requests. Stops a single host from
// spamming reset emails for many users.
export const passwordResetIpRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});

// Per-email cap on password-reset requests. Stops a slow distributed
// attack from flooding a specific account's inbox with reset links.
export const passwordResetEmailRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const raw = typeof body?.email === "string" ? body.email : "";
    const email = raw.toLowerCase().trim();
    return email || `noemail:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },
  message: { error: "too_many_attempts" },
});

// Per-IP cap on signups. Looser than login because typoed signups are
// expected; tight enough to prevent automated account creation.
export const signupIpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});
