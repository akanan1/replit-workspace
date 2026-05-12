import { randomUUID } from "node:crypto";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `prt_${randomUUID()}`),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // SHA-256 hex of the raw token. The raw token is in the email link;
    // never persisted server-side, never logged. Hashing here means a DB
    // leak doesn't hand attackers active reset URLs.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    // Set when the token is consumed; second use against the same token
    // fails. Null means still valid (subject to expiresAt).
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userExpiryIdx: index("password_reset_tokens_user_expiry_idx").on(
      t.userId,
      t.expiresAt,
    ),
  }),
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type NewPasswordResetToken =
  typeof passwordResetTokensTable.$inferInsert;
