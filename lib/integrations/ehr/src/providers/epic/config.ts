import type { KeyObject } from "node:crypto";
import type { JwtSigningAlgorithm } from "../../auth/types";

export interface EpicConfig {
  // FHIR R4 base URL. Confirm against Epic's documentation for the
  // environment being targeted (sandbox vs. a specific customer's prod
  // instance — Epic FHIR endpoints are per-deployment, not global).
  fhirBaseUrl: string;
  // OAuth2 token endpoint URL. Defaults to the FHIR base URL's adjacent
  // /oauth2/token path on most Epic deployments, but confirm.
  tokenUrl: string;
  // Client ID registered with Epic for this app.
  clientId: string;
  // PEM-encoded private key (or pre-built KeyObject) whose matching public
  // key is published in the JWKS that Epic has registered for this client.
  privateKey: string | KeyObject;
  // JWT signing algorithm. Must match the registered key (e.g. RS384, ES384).
  algorithm: JwtSigningAlgorithm;
  // `kid` for the signed JWT header — Epic uses it to select the correct
  // public key from the registered JWKS.
  keyId?: string;
  // OAuth2 scope string for the access token (e.g. "system/DocumentReference.write").
  scope?: string;
  fetchImpl?: typeof fetch;
}
