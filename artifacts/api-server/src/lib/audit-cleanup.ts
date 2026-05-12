import { lt, sql } from "drizzle-orm";
import { auditLogTable, getDb } from "@workspace/db";
import { logger } from "./logger";

// HIPAA expects audit logs to be retained for at least 6 years
// (45 CFR 164.530(j)). Default to 7 to leave a buffer, but let the
// operator dial it via env. Set to 0 to disable cleanup entirely.
const DEFAULT_RETENTION_DAYS = 365 * 7;

function readRetentionDays(): number {
  const raw = process.env["AUDIT_LOG_RETENTION_DAYS"]?.trim();
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RETENTION_DAYS;
  return Math.floor(n);
}

// Postgres advisory-lock key. Two 32-bit ints (hashed manually) so
// every replica computes the same lock id. `pg_try_advisory_lock`
// returns immediately — no replica blocks waiting for the holder.
//
// Pick anything unique to this job; if you add a second cron task,
// pick a different pair.
const ADVISORY_LOCK_KEY_HI = 0x6861_6c6f; // "halo"
const ADVISORY_LOCK_KEY_LO = 0x6175_6469; // "audi"

/**
 * Delete audit_log rows older than the retention window. Returns the
 * number of rows deleted, or null when this replica didn't acquire
 * the advisory lock (another replica is running cleanup).
 *
 * A retention of 0 disables cleanup (treats the table as append-only
 * forever).
 */
export async function cleanupExpiredAuditLogs(): Promise<number | null> {
  const days = readRetentionDays();
  if (days === 0) return 0;

  const db = getDb();

  // pg_try_advisory_lock + matching pg_advisory_unlock must run on the
  // SAME session. Drizzle's pool checks out a fresh connection per
  // query by default, so we acquire the lock and immediately fire the
  // delete on the same call sequence — both queries land on whichever
  // pooled connection the driver picks, but the lock is session-scoped
  // and released by unlock regardless of connection re-use.
  //
  // To keep things simple, run the whole thing as a transaction so all
  // three queries share one connection.
  return db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY_HI}, ${ADVISORY_LOCK_KEY_LO}) as acquired`,
    );
    const acquired = lockResult.rows[0]?.acquired === true;
    if (!acquired) {
      return null;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await tx
        .delete(auditLogTable)
        .where(lt(auditLogTable.at, cutoff))
        .returning({ id: auditLogTable.id });
      return result.length;
    } finally {
      await tx.execute(
        sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY_HI}, ${ADVISORY_LOCK_KEY_LO})`,
      );
    }
  });
}

let timer: NodeJS.Timeout | undefined;

/**
 * Fire cleanup once now and then daily for the lifetime of the
 * process. .unref() so the interval doesn't keep the event loop alive
 * past SIGTERM. Idempotent — calling twice is a no-op past the first.
 *
 * Safe to run on every replica: cleanupExpiredAuditLogs() uses a
 * Postgres advisory lock so only one replica actually deletes rows
 * per tick. Losing replicas exit fast (null return) and try again
 * 24h later.
 */
export function scheduleAuditLogCleanup(): void {
  if (timer) return;

  const tick = async (): Promise<void> => {
    try {
      const deleted = await cleanupExpiredAuditLogs();
      if (deleted === null) {
        logger.debug("audit log cleanup skipped (another replica holds the lock)");
        return;
      }
      if (deleted > 0) {
        logger.info({ deleted }, "audit log cleanup ran");
      }
    } catch (err) {
      logger.error({ err }, "audit log cleanup failed");
    }
  };

  void tick();
  timer = setInterval(() => void tick(), 24 * 60 * 60 * 1000);
  timer.unref();
}

export function stopAuditLogCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

// Re-exported so tests can poke at the cutoff math without exporting
// the env-reading function on its own.
export { readRetentionDays as _readRetentionDays };

// Suppress the unused-eq import lint that would fire if we ever
// switched the WHERE off lt — keep the import resolution path stable.
void sql;
