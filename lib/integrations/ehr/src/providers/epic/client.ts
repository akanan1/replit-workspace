import { JwtBearerAuthProvider } from "../../auth/jwt-bearer";
import { DocumentReferencePusher } from "../../document-reference/pusher";
import { FhirClient } from "../../fhir/client";
import type { EpicConfig } from "./config";

export interface EpicEhrClient {
  fhir: FhirClient;
  auth: JwtBearerAuthProvider;
  documentReference: DocumentReferencePusher;
}

export function createEpicClient(config: EpicConfig): EpicEhrClient {
  const auth = new JwtBearerAuthProvider({
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    algorithm: config.algorithm,
    privateKey: config.privateKey,
    signer: config.signer,
    keyId: config.keyId,
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
