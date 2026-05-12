import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  // Composite key: <limiter-prefix>:<request-key>. The limiter-prefix is
  // express-rate-limit's per-instance prefix, set when each rateLimit()
  // call constructs its store. The request-key is the keyGenerator
  // output (ip + email, just email, just ip, etc.).
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true })
    .notNull(),
});

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
