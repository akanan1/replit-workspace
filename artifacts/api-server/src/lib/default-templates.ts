// Seed templates handed to each new provider on their first GET
// /templates. Each template has a single voice cue (the DB schema
// enforces uniqueness per-user, so we can't ship the historical
// "soap" + "soap note" duplicates — we pick the more specific
// phrase so it doesn't false-match on the word "soap" alone).
//
// Providers can rename, re-cue, reorder, or delete any of these from
// the Settings → Templates page; the seed is one-shot.
export interface DefaultTemplate {
  name: string;
  voiceCue: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "SOAP",
    voiceCue: "soap note",
    body:
      "Subjective:\n\n\n" +
      "Objective:\n\n\n" +
      "Assessment:\n\n\n" +
      "Plan:\n",
  },
  {
    name: "H&P",
    voiceCue: "history and physical",
    body:
      "Chief Complaint:\n\n" +
      "History of Present Illness:\n\n" +
      "Past Medical History:\n\n" +
      "Medications:\n\n" +
      "Allergies:\n\n" +
      "Review of Systems:\n\n" +
      "Physical Exam:\n\n" +
      "Assessment:\n\n" +
      "Plan:\n",
  },
  {
    name: "Progress",
    voiceCue: "progress note",
    body:
      "Subjective:\n\n" +
      "Objective:\n\n" +
      "Assessment & Plan:\n",
  },
  {
    name: "Consult",
    voiceCue: "consult note",
    body:
      "Reason for Consultation:\n\n" +
      "History:\n\n" +
      "Exam:\n\n" +
      "Impression:\n\n" +
      "Recommendations:\n",
  },
  {
    name: "Discharge",
    voiceCue: "discharge summary",
    body:
      "Admission Date:\n" +
      "Discharge Date:\n\n" +
      "Diagnoses:\n\n" +
      "Hospital Course:\n\n" +
      "Discharge Medications:\n\n" +
      "Follow-up:\n",
  },
];
