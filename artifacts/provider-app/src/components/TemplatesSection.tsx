import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ApiError,
  getListTemplatesQueryKey,
  useCreateTemplate,
  useDeleteTemplate,
  useListTemplates,
  useReorderTemplates,
  useResetTemplates,
  useUpdateTemplate,
  type NoteTemplate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TemplatesSection() {
  const queryClient = useQueryClient();
  const query = useListTemplates({
    query: {
      queryKey: getListTemplatesQueryKey(),
    },
  });

  const create = useCreateTemplate();
  const reset = useResetTemplates();
  const reorder = useReorderTemplates();

  const [creating, setCreating] = useState(false);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
  }

  async function move(template: NoteTemplate, direction: -1 | 1) {
    const list = query.data?.data ?? [];
    const idx = list.findIndex((t) => t.id === template.id);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    // Build the reordered id list and let the server normalize sort_order.
    const ids = list.map((t) => t.id);
    const a = ids[idx];
    const b = ids[nextIdx];
    if (!a || !b) return;
    ids[idx] = b;
    ids[nextIdx] = a;
    try {
      await reorder.mutateAsync({ data: { ids } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reorder");
    }
  }

  async function handleCreate(input: TemplateInput) {
    try {
      await create.mutateAsync({
        data: {
          name: input.name,
          voiceCue: input.voiceCue || null,
          body: input.body,
        },
      });
      invalidate();
      setCreating(false);
      toast.success(`Added "${input.name}"`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("That voice cue is already used by another template.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Couldn't create template");
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Reset all templates back to the defaults? Anything you've customised will be deleted.",
      )
    ) {
      return;
    }
    try {
      await reset.mutateAsync();
      invalidate();
      toast.success("Templates reset to defaults");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset");
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Note templates</h2>
          <p className="text-sm text-(--color-muted-foreground)">
            Personal skeletons that the Dictate button can drop into a new
            note. Use voice cues to switch templates hands-free.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleReset()}
          disabled={reset.isPending}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
      </div>

      {query.isPending ? (
        <p className="text-sm text-(--color-muted-foreground)">Loading templates…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-(--color-destructive)">
          Couldn't load templates.{" "}
          {query.error instanceof Error ? query.error.message : ""}
        </p>
      ) : (
        <ul className="space-y-3">
          {query.data.data.map((t, idx) => (
            <li key={t.id}>
              <TemplateRow
                template={t}
                isFirst={idx === 0}
                isLast={idx === query.data.data.length - 1}
                onChange={invalidate}
                onMove={(dir) => void move(t, dir)}
                reordering={reorder.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <TemplateEditor
          initial={{ name: "", voiceCue: "", body: "" }}
          submitLabel="Add template"
          submitting={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add template
        </Button>
      )}
    </Card>
  );
}

interface TemplateInput {
  name: string;
  voiceCue: string;
  body: string;
}

function TemplateRow({
  template,
  isFirst,
  isLast,
  onChange,
  onMove,
  reordering,
}: {
  template: NoteTemplate;
  isFirst: boolean;
  isLast: boolean;
  onChange: () => void;
  onMove: (direction: -1 | 1) => void;
  reordering: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateTemplate();
  const del = useDeleteTemplate();

  async function handleSave(input: TemplateInput) {
    try {
      await update.mutateAsync({
        id: template.id,
        data: {
          name: input.name,
          voiceCue: input.voiceCue || null,
          body: input.body,
        },
      });
      onChange();
      setExpanded(false);
      toast.success("Template updated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("That voice cue is already used by another template.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the "${template.name}" template?`)) return;
    try {
      await del.mutateAsync({ id: template.id });
      onChange();
      toast.success(`Deleted "${template.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex shrink-0 flex-col">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(-1)}
            disabled={isFirst || reordering}
            aria-label={`Move ${template.name} up`}
            className="h-6 w-6 p-0"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(1)}
            disabled={isLast || reordering}
            aria-label={`Move ${template.name} down`}
            className="h-6 w-6 p-0"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <div className="truncate text-base font-medium">{template.name}</div>
            <div className="truncate text-xs text-(--color-muted-foreground)">
              {template.voiceCue
                ? `Voice cue: "${template.voiceCue}"`
                : "No voice cue"}
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-(--color-muted-foreground)" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-(--color-muted-foreground)" aria-hidden="true" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={del.isPending}
          aria-label={`Delete ${template.name}`}
          className="text-(--color-destructive)"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {expanded ? (
        <div className="border-t border-(--color-border) px-4 py-4">
          <TemplateEditor
            initial={{
              name: template.name,
              voiceCue: template.voiceCue ?? "",
              body: template.body,
            }}
            submitLabel="Save changes"
            submitting={update.isPending}
            onCancel={() => setExpanded(false)}
            onSubmit={handleSave}
          />
        </div>
      ) : null}
    </Card>
  );
}

function TemplateEditor({
  initial,
  submitLabel,
  submitting,
  onCancel,
  onSubmit,
}: {
  initial: TemplateInput;
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: TemplateInput) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [voiceCue, setVoiceCue] = useState(initial.voiceCue);
  const [body, setBody] = useState(initial.body);

  useEffect(() => {
    setName(initial.name);
    setVoiceCue(initial.voiceCue);
    setBody(initial.body);
  }, [initial.name, initial.voiceCue, initial.body]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        void onSubmit({ name: trimmedName, voiceCue: voiceCue.trim(), body });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Knee injection follow-up"
            maxLength={120}
            required
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="template-cue">Voice cue (optional)</Label>
          <Input
            id="template-cue"
            value={voiceCue}
            onChange={(e) => setVoiceCue(e.target.value)}
            placeholder="e.g. knee injection"
            maxLength={80}
            disabled={submitting}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="template-body">Body skeleton</Label>
        <Textarea
          id="template-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Subjective:&#10;&#10;Objective:&#10;&#10;Assessment & Plan:&#10;"
          rows={8}
          className="font-mono text-sm"
          disabled={submitting}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
