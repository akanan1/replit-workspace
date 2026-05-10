import type { KeyObject } from "node:crypto";

export interface AccessToken {
  token: string;
  // ms epoch
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface TokenProvider {
  getToken(): Promise<string>;
  getAccessToken(): Promise<AccessToken>;
  invalidate(): void;
}

export interface OAuth2Config {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}

export type JwtSigningAlgorithm =
  | "RS256"
  | "RS384"
  | "RS512"
  | "ES256"
  | "ES384"
  | "ES512";

export interface JwtBearerAuthConfig {
  tokenUrl: string;
  clientId: string;
  // PEM-encoded private key, or a pre-built KeyObject. For KMS-backed
  // signing, build a KeyObject from the wrapped key material upstream.
  privateKey: string | KeyObject;
  algorithm: JwtSigningAlgorithm;
  // Required by most IdPs (incl. Epic) so they can pick the matching
  // public key out of the JWKS the client has registered.
  keyId?: string;
  // `aud` claim. Defaults to tokenUrl per SMART backend services spec.
  audience?: string;
  scope?: string;
  // Lifetime of the client_assertion JWT. SMART recommends ≤ 5 minutes.
  assertionLifetimeSeconds?: number;
  fetchImpl?: typeof fetch;
}
