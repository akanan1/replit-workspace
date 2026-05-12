import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, Loader2, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNotesQueryKey,
  getNote,
  useCreateNote,
  useListPatients,
  useSendNoteToEhr,
  type Note,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface NewNotePageProps {
  patientId: string;
}

type SendState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "sending"; noteId: string }
  | { phase: "sent"; noteId: string; mock: boolean; provider: string }
  | { phase: "error"; message: string };

function getReplacesQueryParam(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const id = new URLSearchParams(window.location.search).get("replaces");
  return id?.trim() || undefined;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NewNotePage({ patientId }: NewNotePageProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const patientsQuery = useListPatients();
  const createNote = useCreateNote();
  const sendNote = useSendNoteToEhr();

  // Snapshot the ?replaces= id on mount so subsequent URL changes don't
  // jump the page out of amend mode.
  const replacesNoteId = useMemo(() => getReplacesQueryParam(), []);

  // When amending, fetch the predecessor via the bare client (not the
  // generated hook — its option types require a queryKey that we'd have
  // to fabricate just to satisfy the type checker). A manual useEffect
  // keeps the fetch conditional on amend mode and runs at most once.
  const [predecessor, setPredecessor] = useState<Note | null>(null);
  useEffect(() => {
    if (!replacesNoteId) return;
    let cancelled = false;
    getNote(replacesNoteId)
      .then((n) => {
        if (!cancelled) setPredecessor(n);
      })
      .catch(() => {
        // Soft-fail: amend banner is best-effort. Form still posts with
        // replacesNoteId so the server enforces the chain.
      });
    return () => {
      cancelled = true;
    };
  }, [replacesNoteId]);

  const [body, setBody] = useState("");
  const [bodyPrefilled, setBodyPrefilled] = useState(false);
  const [draftSavedId, setDraftSavedId] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>({ phase: "idle" });

  // Prefill the body once the predecessor loads. Don't overwrite manual
  // edits — only seed if the textarea is still empty.
  useEffect(() => {
    if (!predecessor || bodyPrefilled) return;
    setBody(predecessor.body);
    setBodyPrefilled(true);
  }, [predecessor, bodyPrefilled]);

  const patient = patientsQuery.data?.data.find((p) => p.id === patientId);

  function invalidateNotes() {
    void queryClient.invalidateQueries({
      queryKey: getListNotesQueryKey({ patientId }),
    });
    void queryClient.invalidateQueries({
      queryKey: getListNotesQueryKey(),
    });
  }

  function createNotePayload() {
    return {
      data: {
        patientId,
        body,
        ...(replacesNoteId ? { replacesNoteId } : {}),
      },
    };
  }

  async function handleSaveDraft() {
    if (!body.trim()) return;
    try {
      const note = await createNote.mutateAsync(createNotePayload());
      setDraftSavedId(note.id);
      invalidateNotes();
    } catch (err) {
      setSendState({
        phase: "error",
        message: err instanceof Error ? err.message : "Save failed.",
      });
    }
  }

  async function handleSaveAndSend() {
    if (!body.trim() || !patient) return;
    setSendState({ phase: "saving" });
    try {
      const note = await createNote.mutateAsync(createNotePayload());
      setDraftSavedId(note.id);
      setSendState({ phase: "sending", noteId: note.id });

      const outcome = await sendNote.mutateAsync({ id: note.id });
      setSendState({
        phase: "sent",
        noteId: note.id,
        mock: outcome.mock,
        provider: outcome.provider,
      });
      invalidateNotes();

      // Short hold so the provider sees the success state before navigating away.
      setTimeout(() => navigate(`/patients/${patientId}`), 1100);
    } catch (err) {
      // Still invalidate — the note row was created, only the push failed.
      invalidateNotes();
      setSendState({
        phase: "error",
        message: err instanceof Error ? err.message : "Send failed.",
      });
    }
  }

  const isBusy = sendState.phase === "saving" || sendState.phase === "sending";
  const amending = Boolean(replacesNoteId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/patients/${patientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patient
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {amending ? "Amend note" : "New note"}
        </h1>
        {patientsQuery.isPending ? (
          <p className="text-(--color-muted-foreground)">Loading patient…</p>
        ) : patient ? (
          <p className="text-(--color-muted-foreground)">
            For{" "}
            <span className="font-medium text-(--color-foreground)">
              {patient.lastName}, {patient.firstName}
            </span>{" "}
            · MRN {patient.mrn}
          </p>
        ) : (
          <p className="text-(--color-destructive)">
            Patient not found ({patientId}).
          </p>
        )}
      </header>

      {amending ? (
        <Card className="border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p>
            Amending the note{" "}
            {predecessor ? (
              <>
                from{" "}
                <span className="font-medium">
                  {formatDate(predecessor.createdAt)}
                </span>
              </>
            ) : (
              <span className="font-mono text-xs">{replacesNoteId}</span>
            )}
            . The original stays on file unchanged; this note will be linked
            via <code className="font-mono">relatesTo: replaces</code> when
            sent to the EHR.
          </p>
        </Card>
      ) : null}

      <div className="space-y-3">
        <Label htmlFor="note-body" className="text-base">
          Note
        </Label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Subjective, objective, assessment, plan…"
          rows={16}
          className="min-h-[50vh] text-base"
          autoFocus
          disabled={isBusy}
        />
      </div>

      <SendStatus state={sendState} draftSavedId={draftSavedId} />

      <div className="flex items-center justify-end gap-3 border-t border-(--color-border) pt-6">
        <Button
          variant="outline"
          size="lg"
          onClick={handleSaveDraft}
          disabled={isBusy || !body.trim()}
        >
          Save draft
        </Button>
        <Button
          size="lg"
          onClick={handleSaveAndSend}
          disabled={isBusy || !body.trim() || !patient}
        >
          {sendState.phase === "saving" || sendState.phase === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {sendState.phase === "saving" ? "Saving…" : "Sending…"}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Save &amp; send to EHR
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function SendStatus({
  state,
  draftSavedId,
}: {
  state: SendState;
  draftSavedId: string | null;
}) {
  if (state.phase === "error") {
    return (
      <p className="text-sm text-(--color-destructive)">{state.message}</p>
    );
  }
  if (state.phase === "sent") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-(--color-foreground)">
        <Check className="h-4 w-4" />
        Sent to EHR ({state.provider}
        {state.mock ? " — mock" : ""}).
      </p>
    );
  }
  if (state.phase === "idle" && draftSavedId) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-(--color-foreground)">
        <Check className="h-4 w-4" />
        Draft saved.
      </p>
    );
  }
  return null;
}
