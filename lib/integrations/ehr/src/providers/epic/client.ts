import { OAuth2TokenProvider } from "../../auth/oauth2";
import { DocumentReferencePusher } from "../../document-reference/pusher";
import { FhirClient } from "../../fhir/client";
import type { EpicConfig } from "./config";

export interface EpicEhrClient {
  fhir: FhirClient;
  auth: OAuth2TokenProvider;
  documentReference: DocumentReferencePusher;
}

export function createEpicClient(config: EpicConfig): EpicEhrClient {
  const auth = new OAuth2TokenProvider({
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scope: config.scope,
    fetchImpl: config.fetchImpl,
  });

  const fhir = new FhirClient({
    baseUrl: config.fhirBaseUrl,
    getToken: () => auth.getToken(),
    fetchImpl: config.fetchImpl,
  });

  const documentReference = new DocumentReferencePusher(fhir);

  return { fhir, auth, documentReference };
}
