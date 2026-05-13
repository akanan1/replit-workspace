// Live smoke test against athenahealth's Preview FHIR sandbox using the
// 2-legged sandbox app. Validates the OAuth2TokenProvider + FhirClient
// path end-to-end against Practice 195900's documented test patients,
// without needing a real provider OAuth login.
//
// Run: pnpm --filter @workspace/scripts run athena-sandbox-smoke

import { createAthenahealthClient } from "@workspace/ehr/athenahealth";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const practiceId = required("ATHENA_SANDBOX_PRACTICE_ID");
  const client = createAthenahealthClient({
    fhirBaseUrl: required("ATHENA_FHIR_BASE_URL"),
    tokenUrl: required("ATHENA_TOKEN_URL"),
    clientId: required("ATHENA_SANDBOX_CLIENT_ID"),
    clientSecret: required("ATHENA_SANDBOX_CLIENT_SECRET"),
    scope: required("ATHENA_SANDBOX_SCOPE"),
  });

  const ahPractice = `Organization/a-1.Practice-${practiceId}`;

  console.log(`[1/3] Minting access token via client_credentials…`);
  const token = await client.auth.getToken();
  console.log(`      OK — token prefix ${token.slice(0, 24)}…`);

  console.log(`[2/3] Searching Patient name=Sandboxtest in Practice ${practiceId}…`);
  const bundle = await client.fhir.search<{
    resourceType: "Patient";
    id: string;
    name?: Array<{ family?: string; given?: string[] }>;
    birthDate?: string;
    gender?: string;
  }>("Patient", {
    "ah-practice": ahPractice,
    name: "Sandboxtest",
  });
  const entries = bundle.entry ?? [];
  console.log(`      OK — ${entries.length} patient(s) returned:`);
  for (const e of entries) {
    const p = e.resource;
    if (!p) continue;
    const nm = p.name?.[0];
    const display = nm
      ? `${(nm.given ?? []).join(" ")} ${nm.family ?? ""}`.trim()
      : "(no name)";
    console.log(`        - ${p.id}  ${display}  ${p.gender ?? "?"}  ${p.birthDate ?? "?"}`);
  }

  console.log(`[3/3] Reading the first patient back by ID…`);
  const firstId = entries[0]?.resource?.id;
  if (!firstId) {
    console.log(`      Skipped — no patients in search result.`);
    return;
  }
  const patient = await client.fhir.read<{
    resourceType: "Patient";
    id: string;
    name?: Array<{ family?: string; given?: string[] }>;
  }>("Patient", firstId);
  const nm = patient.name?.[0];
  console.log(
    `      OK — Patient/${patient.id}: ${(nm?.given ?? []).join(" ")} ${nm?.family ?? ""}`.trim(),
  );

  console.log(`\nSandbox smoke test passed.`);
}

main().catch((err: unknown) => {
  console.error("Sandbox smoke test failed:");
  console.error(err);
  process.exit(1);
});
