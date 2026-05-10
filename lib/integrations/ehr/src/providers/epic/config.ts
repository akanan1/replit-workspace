export interface EpicConfig {
  // FHIR R4 base URL. Confirm against Epic's documentation for the
  // environment being targeted (sandbox vs. a specific customer's prod
  // instance — Epic FHIR endpoints are per-deployment, not global).
  fhirBaseUrl: string;
  // OAuth2 token endpoint URL.
  tokenUrl: string;
  clientId: string;
  // NOTE: Epic backend services typically use SMART JWT client assertion
  // (RSA/ES256-signed `client_assertion`) rather than a shared secret.
  // The shipped OAuth2TokenProvider uses client_credentials w/ Basic auth;
  // swap in a JWT-bearer auth provider before production use against Epic.
  clientSecret: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}
