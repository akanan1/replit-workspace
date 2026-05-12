import { eq, sql } from "drizzle-orm";
import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { getDb, rateLimitBucketsTable } from "@workspace/db";

/**
 * express-rate-limit v7 Store backed by the rate_limit_buckets table.
 * One store instance per rateLimit() call; each gets its own windowMs
 * and prefix (so multiple limiters can share the table).
 *
 * Increment semantics: a window starts on first hit and expires after
 * windowMs. Hits inside the window bump count; hits after the window
 * silently reset count to 1 and extend expiresAt. The UPSERT collapses
 * both branches into a single round-trip.
 *
 * Cleanup of long-expired rows is not done here — rows naturally reset
 * on the next hit for the same key. For high-cardinality limiters,
 * consider a periodic DELETE WHERE expires_at < now() - <retention>.
 */
export class PostgresRateLimitStore implements Store {
  private windowMs = 60_000;
  prefix = "";
  // The store is shared across worker processes via Postgres, so each
  // request hits the canonical counter. localKeys=false tells
  // express-rate-limit that this isn't an in-memory store.
  readonly localKeys = false;

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const rows = await getDb()
      .select()
      .from(rateLimitBucketsTable)
      .where(eq(rateLimitBucketsTable.key, this.fullKey(key)))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return { totalHits: row.count, resetTime: row.expiresAt };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = this.fullKey(key);
    const windowMs = this.windowMs;

    // sql.raw is safe — windowMs is a number we just stringified.
    const rows = await getDb().execute<{
      count: number;
      expires_at: Date;
    }>(sql`
      INSERT INTO rate_limit_buckets (key, count, expires_at)
      VALUES (${fullKey}, 1, NOW() + (${windowMs}::bigint * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN rate_limit_buckets.expires_at < NOW() THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        expires_at = CASE
          WHEN rate_limit_buckets.expires_at < NOW()
            THEN NOW() + (${windowMs}::bigint * INTERVAL '1 millisecond')
          ELSE rate_limit_buckets.expires_at
        END
      RETURNING count, expires_at
    `);

    const row = rows.rows[0];
    if (!row) {
      // Shouldn't happen for an UPSERT with RETURNING, but the types
      // demand it and the alternative is an unsafe non-null assertion.
      throw new Error("rate_limit upsert returned no row");
    }
    return {
      totalHits: row.count,
      resetTime: new Date(row.expires_at),
    };
  }

  async decrement(key: string): Promise<void> {
    // Only called when skipFailedRequests / skipSuccessfulRequests fires.
    // Bound count at zero so we don't go negative across racy decrements.
    await getDb().execute(sql`
      UPDATE rate_limit_buckets
      SET count = GREATEST(count - 1, 0)
      WHERE key = ${this.fullKey(key)}
    `);
  }

  async resetKey(key: string): Promise<void> {
    await getDb()
      .delete(rateLimitBucketsTable)
      .where(eq(rateLimitBucketsTable.key, this.fullKey(key)));
  }

  async resetAll(): Promise<void> {
    // Only used by tests / admin tooling. Don't expose this from a route.
    await getDb().execute(sql`TRUNCATE TABLE rate_limit_buckets`);
  }
}
