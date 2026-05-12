import { getDb, usersTable, type UserRole } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

// Dev users seeded into an empty users table on first boot. Remove once a
// real onboarding flow exists (or gate behind NODE_ENV !== "production").
//
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

export async function seedUsersIfEmpty(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) return;

  const rows = await Promise.all(
    DEMO_USERS.map(async (u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      passwordHash: await hashPassword(u.password),
      role: u.role,
    })),
  );
  await db.insert(usersTable).values(rows);
  logger.info(
    { count: rows.length, emails: DEMO_USERS.map((u) => u.email) },
    "Seeded users table with demo accounts (password: hunter2)",
  );
}
