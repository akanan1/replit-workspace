import { Router, type IRouter } from "express";
import { createAthenahealthClient } from "@workspace/ehr/athenahealth";
import { mapFhirPatient, type Patient as FhirPatient } from "@workspace/ehr";

const router: IRouter = Router();

let cachedClient: ReturnType<typeof createAthenahealthClient> | undefined;

function getSandboxClient(): ReturnType<typeof createAthenahealthClient> {
  if (cachedClient) return cachedClient;
  const required = [
    "ATHENA_FHIR_BASE_URL",
    "ATHENA_TOKEN_URL",
    "ATHENA_SANDBOX_CLIENT_ID",
    "ATHENA_SANDBOX_CLIENT_SECRET",
    "ATHENA_SANDBOX_SCOPE",
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required for the sandbox client`);
    }
  }
  cachedClient = createAthenahealthClient({
    fhirBaseUrl: process.env["ATHENA_FHIR_BASE_URL"] as string,
    tokenUrl: process.env["ATHENA_TOKEN_URL"] as string,
    clientId: process.env["ATHENA_SANDBOX_CLIENT_ID"] as string,
    clientSecret: process.env["ATHENA_SANDBOX_CLIENT_SECRET"] as string,
    scope: process.env["ATHENA_SANDBOX_SCOPE"] as string,
  });
  return cachedClient;
}

// Dev-only — hits the 2-legged Athena sandbox app and returns the
// documented test patients in Practice 195900 mapped to our internal
// patient shape. Lets us *see* live sandbox data through the running
// api-server (rather than only through the standalone smoke script).
router.get("/dev/sandbox-patients", async (req, res) => {
  try {
    const practiceId = process.env["ATHENA_SANDBOX_PRACTICE_ID"];
    if (!practiceId) {
      res.status(500).json({ error: "ATHENA_SANDBOX_PRACTICE_ID not set" });
      return;
    }
    const client = getSandboxClient();
    const bundle = await client.fhir.search<FhirPatient>("Patient", {
      "ah-practice": `Organization/a-1.Practice-${practiceId}`,
      name: "Sandboxtest",
    });
    const patients = (bundle.entry ?? [])
      .map((e) => e.resource)
      .filter((p): p is FhirPatient => Boolean(p))
      .map((p) => ({
        ehrId: p.id,
        ...mapFhirPatient(p),
      }));
    res.json({
      practiceId,
      count: patients.length,
      patients,
    });
  } catch (err) {
    req.log.error({ err }, "sandbox patients query failed");
    const message = err instanceof Error ? err.message : "sandbox_query_failed";
    res.status(502).json({ error: "sandbox_query_failed", message });
  }
});

export default router;
