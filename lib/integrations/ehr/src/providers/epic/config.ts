import type { KeyObject } from "node:crypto";
import type { JwtSigner, JwtSigningAlgorithm } from "../../auth/types";

export interface EpicConfig {
  // FHIR R4 base URL. Confirm against Epic's documentation for the
  // environment being targeted (sandbox vs. a specific customer's prod
  // instance — Epic FHIR endpoints are per-deployment, not global).
  fhirBaseUrl: string;
  // OAuth2 token endpoint URL.
  tokenUrl: string;
  // Client ID registered with Epic for this app.
  clientId: string;
  // JWT signing algorithm. Must match the registered key (e.g. RS384, ES384).
  algorithm: JwtSigningAlgorithm;
  /**
   * Local PEM-encoded private key (or pre-built KeyObject) for signing
   * the client assertion. Mutually exclusive with `signer`.
   */
  privateKey?: string | KeyObject;
  /**
   * External signer override — delegates signature production to a
   * KMS / HSM / cloud key vault so the private key never enters process
   * memory. Mutually exclusive with `privateKey`.
   */
  signer?: JwtSigner;
  // `kid` for the signed JWT header — Epic uses it to select the correct
  // public key from the registered JWKS.
  keyId?: string;
  // OAuth2 scope string for the access token (e.g. "system/DocumentReference.write").
  scope?: string;
  fetchImpl?: typeof fetch;
}
