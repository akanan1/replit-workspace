import { useEffect, useState } from "react";
import { CheckCircle2, CloudCog, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface SandboxPatient {
  ehrId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn: string;
}

interface SandboxResponse {
  practiceId: string;
  count: number;
  patients: SandboxPatient[];
}

function formatDob(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function calculateAge(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// Dev-only page that fetches live patients from athenahealth's Preview
// sandbox via /api/dev/sandbox-patients. Renders them so we can *see*
// the integration working end-to-end through real UI, not just JSON.
export function DevSandboxPage() {
  const [data, setData] = useState<SandboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/sandbox-patients", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${body}`);
      }
      setData((await res.json()) as SandboxResponse);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-(--color-muted-foreground)">
            <CloudCog className="h-3.5 w-3.5" aria-hidden="true" />
            Dev · Athena Preview sandbox
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Live FHIR query
          </h1>
          <p className="text-(--color-muted-foreground)">
            Each load hits{" "}
            <code className="rounded bg-(--color-muted) px-1.5 py-0.5 text-sm">
              api.preview.platform.athenahealth.com
            </code>{" "}
            via 2-legged client_credentials. No mock data, no per-user
            OAuth — straight through our{" "}
            <code className="rounded bg-(--color-muted) px-1.5 py-0.5 text-sm">
              FhirClient
            </code>
            .
          </p>
        </div>
        <Button onClick={() => void load()} disabled={loading} size="lg">
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </header>

      {error ? (
        <Card className="border-(--color-destructive)/30 bg-(--color-destructive)/5 p-6">
          <div className="flex items-start gap-3">
            <XCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-(--color-destructive)"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium text-(--color-destructive)">
                Sandbox query failed
              </p>
              <p className="text-sm break-all">{error}</p>
            </div>
          </div>
        </Card>
      ) : data ? (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                <span className="font-medium">Live connection OK</span>
              </div>
              <div>
                <span className="text-(--color-muted-foreground)">
                  Practice:
                </span>{" "}
                <code className="text-sm">{data.practiceId}</code>
              </div>
              <div>
                <span className="text-(--color-muted-foreground)">
                  Patients returned:
                </span>{" "}
                <span className="font-medium">{data.count}</span>
              </div>
              {refreshedAt ? (
                <div className="text-(--color-muted-foreground)">
                  Last loaded {refreshedAt.toLocaleTimeString()}
                </div>
              ) : null}
            </div>
          </Card>

          <ul className="space-y-3" aria-label="Sandbox patients">
            {data.patients.map((p) => {
              const age = calculateAge(p.dateOfBirth);
              return (
                <li key={p.ehrId}>
                  <Card>
                    <div className="flex items-center justify-between gap-4 px-6 py-5">
                      <div className="space-y-1">
                        <div className="text-lg font-medium leading-snug">
                          {p.lastName}, {p.firstName}
                        </div>
                        <div className="text-sm text-(--color-muted-foreground)">
                          DOB {formatDob(p.dateOfBirth)}
                          {age != null ? ` · ${age} yrs` : ""} · EHR id{" "}
                          <code>{p.ehrId}</code>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-(--color-muted-foreground)">
            Dev-only route — mounted only when{" "}
            <code>NODE_ENV !== "production"</code>. Hits the 2-legged
            sandbox app, not the 3-legged production app.
          </p>
        </>
      ) : (
        <p className="text-(--color-muted-foreground)">
          Loading sandbox patients…
        </p>
      )}
    </div>
  );
}
