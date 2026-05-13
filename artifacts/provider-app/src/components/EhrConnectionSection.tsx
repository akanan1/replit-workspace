import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, PlugZap, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetEhrConnectionStatusQueryKey,
  useDisconnectEhr,
  useGetEhrConnectionStatus,
  useStartEhrOauth,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Settings section that drives the SMART OAuth handshake with Athena.
//
// Flow:
//   1. User clicks "Connect Athena"
//   2. POST /auth/ehr/athenahealth/start returns an authorize URL
//   3. We replace the current window's location with that URL
//   4. Athena handles login, redirects back to /api/auth/ehr/callback
//   5. The callback exchanges the code, stores tokens, and 303 redirects
//      to /settings?ehrConnected=1&provider=athenahealth
//   6. This component reads those query params on mount and surfaces a
//      toast + re-fetches the status row.
export function EhrConnectionSection() {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const status = useGetEhrConnectionStatus({
    query: { queryKey: getGetEhrConnectionStatusQueryKey() },
  });
  const start = useStartEhrOauth();
  const disconnect = useDisconnectEhr();

  // Surface the result of the OAuth callback. The callback redirected
  // back to /settings with query params; on mount we inspect them and
  // strip them out so a refresh doesn't re-fire the toast.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ehrConnected = params.get("ehrConnected");
    if (!ehrConnected) return;
    const provider = params.get("provider") ?? "EHR";
    const errorCode = params.get("error");
    if (ehrConnected === "1") {
      toast.success(`Connected to ${provider}`);
      void queryClient.invalidateQueries({
        queryKey: getGetEhrConnectionStatusQueryKey(),
      });
    } else {
      toast.error(`Couldn't connect: ${errorCode ?? "unknown error"}`);
    }
    // Strip the params from the URL so the toast doesn't reappear on
    // refresh. wouter's navigate replaces history when the target is
    // identical, so include just the pathname.
    const pathOnly = location.split("?")[0] ?? "/settings";
    navigate(pathOnly, { replace: true });
    // We deliberately read window.location.search once on mount; the
    // deps array is intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    try {
      const { authorizeUrl } = await start.mutateAsync({
        provider: "athenahealth",
        data: { returnPath: "/settings" },
      });
      // Full navigation, not a popup — popup OAuth tends to lose the
      // session cookie on the redirect back due to SameSite settings,
      // and the resulting state-mismatch error is hard to debug.
      window.location.href = authorizeUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start connection");
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect from Athena? Schedule + chart queries will fall back to mock data until you reconnect.",
      )
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync({ provider: "athenahealth" });
      void queryClient.invalidateQueries({
        queryKey: getGetEhrConnectionStatusQueryKey(),
      });
      toast.success("Disconnected from Athena");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    }
  }

  const athena = status.data?.athenahealth;
  const connected = Boolean(athena?.connected);

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <PlugZap
          className="mt-0.5 h-6 w-6 text-(--color-muted-foreground)"
          aria-hidden="true"
        />
        <div className="flex-1">
          <h2 className="text-lg font-medium">EHR connection</h2>
          <p className="text-sm text-(--color-muted-foreground)">
            Sign in to your Athena account so the schedule, patient
            charts, and note-pushing run against your real EHR identity.
          </p>
        </div>
      </div>

      {status.isPending ? (
        <p className="text-sm text-(--color-muted-foreground)">
          Loading connection status…
        </p>
      ) : status.isError ? (
        <p role="alert" className="text-sm text-(--color-destructive)">
          Couldn't load connection status.
        </p>
      ) : connected ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-(--color-muted-foreground)">Status</dt>
              <dd>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  Connected
                </span>
              </dd>
            </div>
            {athena?.practitionerId ? (
              <div>
                <dt className="text-(--color-muted-foreground)">Practitioner</dt>
                <dd className="font-mono text-xs break-all">
                  {athena.practitionerId}
                </dd>
              </div>
            ) : null}
            {athena?.expiresAt ? (
              <div>
                <dt className="text-(--color-muted-foreground)">
                  Access token expires
                </dt>
                <dd>
                  {new Date(athena.expiresAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void connect()}
              disabled={start.isPending}
            >
              {start.isPending ? "Starting…" : "Reconnect"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDisconnect()}
              disabled={disconnect.isPending}
              className="text-(--color-destructive)"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-(--color-muted-foreground)">
            Not connected — schedule + chart queries are running in mock
            mode.
          </p>
          <Button onClick={() => void connect()} disabled={start.isPending}>
            {start.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Starting…
              </>
            ) : (
              "Connect Athena"
            )}
          </Button>
          <p className="flex items-start gap-1.5 text-xs text-(--color-muted-foreground)">
            <ShieldAlert
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            You'll be redirected to Athena to sign in. The browser comes
            back here once Athena confirms.
          </p>
        </div>
      )}
    </Card>
  );
}
