import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  getDb,
  passwordResetTokensTable,
  type PasswordResetToken,
} from "@workspace/db";

const TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface IssuedResetToken {
  raw: string;
  record: PasswordResetToken;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issuePasswordResetToken(
  userId: string,
): Promise<IssuedResetToken> {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const [record] = await getDb()
    .insert(passwordResetTokensTable)
    .values({ userId, tokenHash, expiresAt })
    .returning();
  if (!record) {
    throw new Error("Failed to issue password reset token");
  }
  return { raw, record };
}

/**
 * Look up an unused, unexpired reset token by its raw value. Returns
 * null when the token doesn't exist, has expired, or has already been
 * consumed.
 */
export async function findValidResetToken(
  raw: string,
): Promise<PasswordResetToken | null> {
  const tokenHash = hashToken(raw);
  const rows = await getDb()
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        gt(passwordResetTokensTable.expiresAt, new Date()),
        isNull(passwordResetTokensTable.usedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markResetTokenUsed(tokenId: string): Promise<void> {
  await getDb()
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, tokenId));
}
