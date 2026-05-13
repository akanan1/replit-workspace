import type { NoteTemplate } from "@workspace/api-client-react";

export type { NoteTemplate };

// Voice-cue detector that runs against a user-supplied template list
// (the API hands us the signed-in provider's personal templates). A
// template with a null voiceCue is "selection-only" and never matches
// here. Longer cues are tried first so a more specific phrase wins
// over a substring overlap ("history and physical" before "history").
//
// Leading filler words ("okay", "new", "start") are tolerated so the
// doctor can say "okay soap note, subjective: …" and have the template
// still apply.
const LEADING_FILLERS = ["", "okay ", "new ", "start "] as const;
const CUE_INSPECT_HEAD = 60;

export function detectTemplateFromVoice(
  text: string,
  templates: NoteTemplate[],
): NoteTemplate | null {
  // Normalize: lowercase, strip trivial punctuation, collapse runs of
  // whitespace. The collapse step matters because a comma between cue
  // words ("SOAP, note") would otherwise survive as a double-space and
  // break a direct startsWith match.
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const head = normalized.slice(0, CUE_INSPECT_HEAD);

  // Sort by descending cue length so the most specific phrase wins.
  // We sort a copy — never mutate the array the caller owns.
  const withCues = templates
    .filter((t): t is NoteTemplate & { voiceCue: string } => Boolean(t.voiceCue))
    .slice()
    .sort((a, b) => b.voiceCue.length - a.voiceCue.length);

  for (const template of withCues) {
    const cue = template.voiceCue.toLowerCase();
    for (const filler of LEADING_FILLERS) {
      if (head.startsWith(`${filler}${cue}`)) return template;
    }
  }
  return null;
}

export function stripCueFromTranscript(
  text: string,
  template: NoteTemplate,
): string {
  if (!template.voiceCue) return text;
  const cue = template.voiceCue.toLowerCase();
  const lower = text.toLowerCase();
  for (const filler of LEADING_FILLERS) {
    const phrase = `${filler}${cue}`;
    if (lower.startsWith(phrase)) {
      // Also eat trailing punctuation + whitespace after the cue.
      return text.slice(phrase.length).replace(/^[\s,.;:]+/, "");
    }
  }
  return text;
}
