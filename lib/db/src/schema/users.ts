import { randomUUID } from "node:crypto";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type UserRole = "admin" | "member";

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => `usr_${randomUUID()}`),
  email: text("email").notNull().unique(),
  // scrypt output: `<saltHex>:<keyHex>`. See api-server/src/lib/auth.ts.
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  // Application-level role. "admin" can view the audit log and other
  // compliance surfaces; "member" is the default and what signup creates.
  // Postgres-side this is just text — we narrow in TS so the API layer
  // can pattern-match exhaustively, but the DB will accept anything.
  role: text("role").$type<UserRole>().notNull().default("member"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
