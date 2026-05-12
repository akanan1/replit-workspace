import { eq, inArray } from "drizzle-orm";
import { getDb, usersTable, type UserRole } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

// Demo users idempotently re-seeded at every boot (in non-production).
// alice is seeded as an admin so the audit-log UI is reachable from at
// least one demo account; bob is a regular member.
const DEMO_USERS: Array<{
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}> = [
  {
    id: "usr_demo_alice",
    email: "alice@halonote.example",
    displayName: "Dr. Alice Chen",
    password: "hunter2",
    role: "admin",
  },
  {
    id: "usr_demo_bob",
    email: "bob@halonote.example",
    displayName: "Dr. Bob Park",
    password: "hunter2",
    role: "member",
  },
];

/**
 * Ensure the demo users exist with the documented passwords + roles.
 * Idempotent — safe to call on every boot. Production deployments
 * should set NODE_ENV=production to suppress (real users don't want
 * a seeded alice@example backdoor in their prod DB).
 *
 * Naming kept for backwards compat with index.ts wiring; the
 * "IfEmpty" suffix is misleading now (the function used to bail on
 * a non-empty users table). Leaving for git-blame continuity.
 */
export async function seedUsersIfEmpty(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") return;

  const db = getDb();
  const emails = DEMO_USERS.map((u) => u.email);
  const existing = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.email, emails));
  const have = new Set(existing.map((r) => r.email));
  const missing = DEMO_USERS.filter((u) => !have.has(u.email));
  if (missing.length === 0) {
    // Already-present demo users keep their stored hashes. We don't
    // overwrite passwords here — if a developer changes them locally,
    // re-seeding shouldn't clobber that.
    return;
  }

  const rows = await Promise.all(
    missing.map(async (u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      passwordHash: await hashPassword(u.password),
      role: u.role,
    })),
  );
  // ON CONFLICT DO NOTHING on email — two parallel boots seeding at once
  // are both fine with this. ID conflicts are also possible if a previous
  // run inserted alice with a different email; covered by the conflict.
  await db
    .insert(usersTable)
    .values(rows)
    .onConflictDoNothing({ target: usersTable.email });

  logger.info(
    { count: rows.length, emails: missing.map((u) => u.email) },
    "Seeded missing demo accounts (password: hunter2)",
  );
}

/**
 * Test helper: nuke and re-seed the demo users. Resets hashes back to
 * the documented passwords. Use from E2E globalSetup, not production.
 */
export async function resetDemoUsersForTests(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("resetDemoUsersForTests called in production");
  }
  const db = getDb();
  const emails = DEMO_USERS.map((u) => u.email);
  await db.delete(usersTable).where(inArray(usersTable.email, emails));
  await seedUsersIfEmpty();
}

void eq;
