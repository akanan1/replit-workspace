import { TOTP, Secret } from "otpauth";

const ISSUER = "HaloNote";
const DIGITS = 6;
const PERIOD = 30;
const WINDOW = 1; // accept code from the previous / next 30s slot

interface TotpHandle {
  uri: string;
  secret: string;
}

/**
 * Generate a fresh TOTP secret + provisioning URI for `label`. Label is
 * typically the user's email — the authenticator app displays it next
 * to the issuer name so users can disambiguate accounts.
 */
export function generateTotpSecret(label: string): TotpHandle {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret,
  });
  return { uri: totp.toString(), secret: secret.base32 };
}

/**
 * Verify a 6-digit TOTP code against the stored secret. Accepts a ±1
 * window (so a code right at the boundary doesn't fail just because the
 * user's phone clock is a few seconds off). Returns true on a match.
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.validate({ token: trimmed, window: WINDOW }) !== null;
}
