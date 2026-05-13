import { describe, expect, it } from "vitest";
import {
  detectTemplateFromVoice,
  stripCueFromTranscript,
  type NoteTemplate,
} from "./note-templates";

// Fixture list — mirrors the shape the API returns. Cues match the
// default seed so the tests still describe realistic provider behavior.
const FIXTURES: NoteTemplate[] = [
  {
    id: "tpl_soap",
    name: "SOAP",
    voiceCue: "soap note",
    body: "Subjective:\n",
    sortOrder: 10,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "tpl_hp",
    name: "H&P",
    voiceCue: "history and physical",
    body: "Chief Complaint:\n",
    sortOrder: 20,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "tpl_progress",
    name: "Progress",
    voiceCue: "progress note",
    body: "Subjective:\n",
    sortOrder: 30,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "tpl_consult",
    name: "Consult",
    voiceCue: "consult note",
    body: "Reason:\n",
    sortOrder: 40,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  // A "selection-only" template with no cue — must never match.
  {
    id: "tpl_blank",
    name: "Blank",
    voiceCue: null,
    body: "",
    sortOrder: 50,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
];

const byId = (id: string) => FIXTURES.find((t) => t.id === id)!;

describe("detectTemplateFromVoice", () => {
  it("matches the basic phrase 'soap note'", () => {
    expect(detectTemplateFromVoice("soap note", FIXTURES)?.id).toBe("tpl_soap");
  });

  it("matches 'history and physical' as H&P", () => {
    expect(
      detectTemplateFromVoice("history and physical", FIXTURES)?.id,
    ).toBe("tpl_hp");
  });

  it("matches a leading filler word", () => {
    expect(
      detectTemplateFromVoice("okay soap note for Mrs. Smith", FIXTURES)?.id,
    ).toBe("tpl_soap");
    expect(
      detectTemplateFromVoice("new progress note today", FIXTURES)?.id,
    ).toBe("tpl_progress");
    expect(
      detectTemplateFromVoice("start consult note", FIXTURES)?.id,
    ).toBe("tpl_consult");
  });

  it("prefers the longer, more specific cue when both match", () => {
    // Two templates: short cue and long cue that both prefix the head.
    const longer: NoteTemplate = {
      ...byId("tpl_soap"),
      id: "tpl_long",
      voiceCue: "soap note for chest pain",
    };
    const choice = detectTemplateFromVoice(
      "soap note for chest pain please",
      [byId("tpl_soap"), longer],
    );
    expect(choice?.id).toBe("tpl_long");
  });

  it("ignores trivial punctuation", () => {
    expect(
      detectTemplateFromVoice("SOAP, note for chest pain", FIXTURES)?.id,
    ).toBe("tpl_soap");
  });

  it("returns null when nothing in the head matches", () => {
    expect(
      detectTemplateFromVoice("the patient reports headache", FIXTURES),
    ).toBeNull();
  });

  it("does not match if the cue is buried far into the transcript", () => {
    const buried =
      "the patient reports chest pain with associated shortness of breath soap";
    expect(detectTemplateFromVoice(buried, FIXTURES)).toBeNull();
  });

  it("never matches a template whose voiceCue is null", () => {
    expect(
      detectTemplateFromVoice("blank template please", [byId("tpl_blank")]),
    ).toBeNull();
  });
});

describe("stripCueFromTranscript", () => {
  it("strips the cue and following punctuation/space", () => {
    const result = stripCueFromTranscript(
      "SOAP note, patient reports headache",
      byId("tpl_soap"),
    );
    expect(result).toBe("patient reports headache");
  });

  it("strips an 'okay <cue>' prefix", () => {
    const result = stripCueFromTranscript(
      "okay soap note for Mrs. Smith",
      byId("tpl_soap"),
    );
    expect(result).toBe("for Mrs. Smith");
  });

  it("returns the transcript unchanged if no cue prefix matches", () => {
    const input = "patient is here for follow-up";
    expect(stripCueFromTranscript(input, byId("tpl_soap"))).toBe(input);
  });

  it("returns the transcript unchanged when the template has no cue", () => {
    const input = "patient is here for follow-up";
    expect(stripCueFromTranscript(input, byId("tpl_blank"))).toBe(input);
  });
});
