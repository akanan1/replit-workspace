import { sign as cryptoSign, type KeyObject } from "node:crypto";
import type { JwtSigningAlgorithm } from "./types";

interface AlgParams {
  hash: string;
  dsaEncoding?: "ieee-p1363";
}

const ALG_PARAMS: Record<JwtSigningAlgorithm, AlgParams> = {
  RS256: { hash: "sha256" },
  RS384: { hash: "sha384" },
  RS512: { hash: "sha512" },
  // ECDSA needs `ieee-p1363` (a.k.a. JOSE) signature encoding — Node defaults
  // to DER, which IdPs will reject as malformed.
  ES256: { hash: "sha256", dsaEncoding: "ieee-p1363" },
  ES384: { hash: "sha384", dsaEncoding: "ieee-p1363" },
  ES512: { hash: "sha512", dsaEncoding: "ieee-p1363" },
};

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export interface SignJwtOptions {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  privateKey: string | KeyObject;
  algorithm: JwtSigningAlgorithm;
}

export function signJwt(opts: SignJwtOptions): string {
  const params = ALG_PARAMS[opts.algorithm];
  const headerJson = JSON.stringify({
    ...opts.header,
    alg: opts.algorithm,
    typ: "JWT",
  });
  const claimsJson = JSON.stringify(opts.claims);
  const signingInput = `${base64url(headerJson)}.${base64url(claimsJson)}`;

  const keyForSign = params.dsaEncoding
    ? { key: opts.privateKey, dsaEncoding: params.dsaEncoding }
    : opts.privateKey;

  const signature = cryptoSign(
    params.hash,
    Buffer.from(signingInput),
    keyForSign,
  );

  return `${signingInput}.${base64url(signature)}`;
}
