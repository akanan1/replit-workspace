import {
  createAthenahealthClient,
  type AthenahealthEhrClient,
} from "@workspace/ehr/athenahealth";

let cached: AthenahealthEhrClient | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for the athenahealth client but was not set.`,
    );
  }
  return value;
}

// Lazy singleton. Reads ATHENA_* env vars on first call so the api-server
// can boot without athenahealth configured (only routes that touch it fail).
export function getAthenahealthClient(): AthenahealthEhrClient {
  if (!cached) {
    cached = createAthenahealthClient({
      fhirBaseUrl: requireEnv("ATHENA_FHIR_BASE_URL"),
      tokenUrl: requireEnv("ATHENA_TOKEN_URL"),
      clientId: requireEnv("ATHENA_CLIENT_ID"),
      clientSecret: requireEnv("ATHENA_CLIENT_SECRET"),
      scope: process.env.ATHENA_SCOPE,
    });
  }
  return cached;
}
