import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, CloudDownload, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getListPatientsQueryKey,
  useListPatients,
  useSyncPatientFromEhr,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SyncFromEhrButton() {
  const queryClient = useQueryClient();
  const sync = useSyncPatientFromEhr();
  const [open, setOpen] = useState(false);
  const [externalId, setExternalId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = externalId.trim();
    if (!trimmed) return;
    try {
      const result = await sync.mutateAsync({ data: { externalId: trimmed } });
      toast.success(
        result.synced.created
          ? `Imported ${result.firstName} ${result.lastName}`
          : `Refreshed ${result.firstName} ${result.lastName}`,
      );
      setExternalId("");
      setOpen(false);
      void queryClient.invalidateQueries({
        queryKey: getListPatientsQueryKey(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    }
  }

  if (!open) {
    return (
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <CloudDownload className="h-4 w-4" aria-hidden="true" />
        Sync from EHR
      </Button>
    );
  }
  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex items-end gap-2"
    >
      <div className="space-y-1">
        <Label htmlFor="ehr-external-id" className="text-xs">
          EHR Patient id
        </Label>
        <Input
          id="ehr-external-id"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="e.g. erXuFYUfucBZaryVksYEcMg3"
          autoFocus
          disabled={sync.isPending}
        />
      </div>
      <Button type="submit" size="lg" disabled={sync.isPending || !externalId.trim()}>
        {sync.isPending ? "Syncing…" : "Pull"}
      </Button>
      <Button
        type="button"
        size="lg"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setExternalId("");
        }}
        disabled={sync.isPending}
      >
        Cancel
      </Button>
    </form>
  );
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

export function PatientsPage() {
  const { data, isPending, isError, error } = useListPatients();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Patients</h1>
          <p className="text-(--color-muted-foreground)">
            Select a patient to see their notes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncFromEhrButton />
          <Link href="/patients/new">
            <Button size="lg" variant="outline">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add patient
            </Button>
          </Link>
        </div>
      </header>

      {isPending ? (
        <p role="status" className="text-(--color-muted-foreground)">
          Loading patients…
        </p>
      ) : isError ? (
        <p role="alert" className="text-(--color-destructive)">
          Couldn't load patients. {error instanceof Error ? error.message : ""}
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Patients">
          {data.data.map((patient) => {
            const age = calculateAge(patient.dateOfBirth);
            return (
              <li key={patient.id}>
                <Link href={`/patients/${patient.id}`}>
                  <Card className="cursor-pointer transition-colors hover:bg-(--color-muted)">
                    <div className="flex items-center justify-between gap-4 px-6 py-5">
                      <div className="space-y-1">
                        <div className="text-lg font-medium leading-snug">
                          {patient.lastName}, {patient.firstName}
                        </div>
                        <div className="text-sm text-(--color-muted-foreground)">
                          DOB {formatDob(patient.dateOfBirth)}
                          {age != null ? ` · ${age} yrs` : ""} · MRN{" "}
                          {patient.mrn}
                        </div>
                      </div>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-(--color-muted-foreground)"
                        aria-hidden="true"
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
