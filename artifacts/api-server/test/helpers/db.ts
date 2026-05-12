import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@workspace/db";
import { waitForPendingAudits } from "../../src/middlewares/audit";

// Wipe every table the api server writes to. RESTART IDENTITY resets any
// SERIAL/identity sequences; CASCADE follows FK chains (sessions → users,
// notes → users via authorId, audit_log → users). Table names are baked
// into the SQL because they're a hardcoded constant — not user input —
// so no injection surface.
//
// Wait for pending audit-log writes to flush first. The audit middleware
// is fire-and-forget on res "close"; if a test finishes before its audit
// insert lands, the next test's TRUNCATE on users races the FK insert
// from audit_log → users and deadlocks.
export async function resetTestDb(): Promise<void> {
  await waitForPendingAudits();
  await getDb().execute(
    sql`TRUNCATE TABLE audit_log, sessions, notes, patients, users RESTART IDENTITY CASCADE`,
  );
}

export async function teardownTestDb(): Promise<void> {
  await waitForPendingAudits();
  await closeDb();
}
