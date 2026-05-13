import { FhirClient } from "@workspace/ehr";
import { DocumentReferencePusher } from "@workspace/ehr/document-reference";
import { getConnection, getValidAccessToken } from "./ehr-oauth";

export interface UserEhrClient {
  fhir: FhirClient;
  documentReference: DocumentReferencePusher;
  practitionerId: string | null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for the EHR client.`);
  return v;
}

/**
 * Build a FhirClient scoped to a specific provider's SMART OAuth
 * connection. The token getter resolves the user's row each call and
 * refreshes via the refresh_token grant when the access token is
 * within the skew window — see `getValidAccessToken`.
 *
 * Returns null when the user hasn't connected the given provider, so
 * callers can fall back to mock mode without throwing.
 */
export async function getAthenahealthClientForUser(
  userId: string,
): Promise<UserEhrClient | null> {
  const conn = await getConnection(userId, "athenahealth");
  if (!conn) return null;

  const fhir = new FhirClient({
    baseUrl: requireEnv("ATHENA_FHIR_BASE_URL"),
    getToken: () => getValidAccessToken(userId, "athenahealth"),
  });
  return {
    fhir,
    documentReference: new DocumentReferencePusher(fhir),
    practitionerId: conn.practitionerId,
  };
}
