import { getDb, usersTable, type User, type UserRole } from "@workspace/db";
import { hashPassword } from "../../src/lib/auth";

export interface TestUserInput {
  id?: string;
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
}

export async function createTestUser(input: TestUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const values = {
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    ...(input.role ? { role: input.role } : {}),
    ...(input.id ? { id: input.id } : {}),
  };
  const [user] = await getDb().insert(usersTable).values(values).returning();
  if (!user) throw new Error("Failed to create test user");
  return user;
}
