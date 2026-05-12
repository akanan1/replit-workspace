import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@workspace/db";
import { waitForPendingAudits } from "../../src/middlewares/audit";

// Wipe every table the api server writes to. RESTART IDENTITY resets any
// SERIAL/identity sequences; CASCADE follows FK chains (sessions → users,
// notes → users via authorId, audit_log → users, password_reset_tokens
// → users). Table names are baked into the SQL because they're a
// hardcoded constant — not user input — so no injection surface.
//
// rate_limit_buckets isn't FK-tied to anything but we wipe it here so
// the per-email login rate-limit test gets a fresh bucket each suite
// (now that the store is Postgres-backed instead of in-memory).
//
// Wait for pending audit-log writes to flush first. The audit middleware
// is fire-and-forget on res "close"; if a test finishes before its audit
// insert lands, the next test's TRUNCATE on users races the FK insert
// from audit_log → users and deadlocks.
export async function resetTestDb(): Promise<void> {
  await waitForPendingAudits();
  await getDb().execute(
    sql`TRUNCATE TABLE
      audit_log,
      sessions,
      notes,
      patients,
      password_reset_tokens,
      rate_limit_buckets,
      users
    RESTART IDENTITY CASCADE`,
  );
}

export async function teardownTestDb(): Promise<void> {
  await waitForPendingAudits();
  await closeDb();
}
