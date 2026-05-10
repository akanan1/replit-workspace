import type { JwtSigningAlgorithm } from "./types";

export type EcdsaAlgorithm = Extract<
  JwtSigningAlgorithm,
  "ES256" | "ES384" | "ES512"
>;

// Coordinate size in bytes per curve. ES512 uses P-521 (not P-512), so its
// coordinate is ceil(521 / 8) = 66 bytes — easy to get wrong.
const COORD_SIZE: Record<EcdsaAlgorithm, number> = {
  ES256: 32,
  ES384: 48,
  ES512: 66,
};

/**
 * Convert an ASN.1 DER-encoded ECDSA signature to JOSE / IEEE-P1363
 * format (`r || s`, each zero-padded to the curve's coordinate size).
 *
 * KMS / HSM / cloud key vaults almost universally return DER for ECDSA;
 * JWS rejects DER and requires the raw concatenated form. Use this
 * inside a `JwtSigner` callback when wiring up an ECDSA KMS key:
 *
 * ```ts
 * signer: async (signingInput, algorithm) => {
 *   const out = await kms.send(new SignCommand({ ... }));
 *   return derToJose(out.Signature!, algorithm as EcdsaAlgorithm);
 * }
 * ```
 *
 * Throws if the input is not well-formed DER or if `r`/`s` exceeds the
 * curve's coordinate size.
 */
export function derToJose(
  der: Buffer | Uint8Array,
  algorithm: EcdsaAlgorithm,
): Buffer {
  const buf = Buffer.isBuffer(der) ? der : Buffer.from(der);
  const coordSize = COORD_SIZE[algorithm];

  let offset = 0;
  if (buf[offset++] !== 0x30) {
    throw new Error("Invalid DER signature: expected SEQUENCE (0x30).");
  }

  const seqLen = readLength(buf, offset);
  offset = seqLen.next;
  if (offset + seqLen.value !== buf.length) {
    throw new Error(
      "Invalid DER signature: declared SEQUENCE length does not match buffer length.",
    );
  }

  const r = readInteger(buf, offset);
  offset = r.next;
  const s = readInteger(buf, offset);
  offset = s.next;

  if (offset !== buf.length) {
    throw new Error(
      "Invalid DER signature: trailing bytes after second INTEGER.",
    );
  }

  return Buffer.concat([
    padToCoord(r.value, coordSize),
    padToCoord(s.value, coordSize),
  ]);
}

function readLength(
  buf: Buffer,
  offset: number,
): { value: number; next: number } {
  let first = buf[offset++];
  if ((first & 0x80) === 0) {
    return { value: first, next: offset };
  }
  const lenBytes = first & 0x7f;
  if (lenBytes === 0 || lenBytes > 2) {
    throw new Error(
      `Invalid DER signature: unsupported length form (${lenBytes} bytes).`,
    );
  }
  let value = 0;
  for (let i = 0; i < lenBytes; i++) {
    value = (value << 8) | buf[offset++];
  }
  return { value, next: offset };
}

function readInteger(
  buf: Buffer,
  offset: number,
): { value: Buffer; next: number } {
  if (buf[offset++] !== 0x02) {
    throw new Error("Invalid DER signature: expected INTEGER (0x02).");
  }
  const len = readLength(buf, offset);
  offset = len.next;
  let value = buf.subarray(offset, offset + len.value);
  offset += len.value;
  // Strip DER's positive-integer leading-zero byte (added when the high
  // bit of the magnitude would otherwise mark the integer as negative).
  while (value.length > 1 && value[0] === 0x00) {
    value = value.subarray(1);
  }
  return { value, next: offset };
}

function padToCoord(value: Buffer, size: number): Buffer {
  if (value.length > size) {
    throw new Error(
      `Invalid ECDSA component: ${value.length} bytes exceeds coordinate size ${size}.`,
    );
  }
  if (value.length === size) return value;
  const padded = Buffer.alloc(size);
  value.copy(padded, size - value.length);
  return padded;
}
