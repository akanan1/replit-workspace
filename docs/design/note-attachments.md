# Note attachments — design (waiting on storage decision)

> Status: **proposal, blocked on storage choice.** Nothing is wired up yet.

Providers want to attach images (wound photos, ECG screenshots, lab
scans) and PDFs (referrals, outside records) to clinical notes.
Attachments need to ride through the EHR push so the receiving system
keeps them with the note.

## Decision needed

Pick where attachment bytes live. Three options, ordered by recommended
default:

| Option            | Pros                                                       | Cons                                                  |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Supabase Storage  | Already in stack; same SLA/billing as the DB; PHI-safe ACLs | Coupled to Supabase; egress not free                  |
| AWS S3 + presigned URLs | Cheapest at scale; clear ownership; CloudFront cache    | New vendor; more IAM surface; need lifecycle policies |
| Defer             | No new infra; ship the next feature first                  | Providers keep asking; workaround is email + paper    |

**Recommendation: Supabase Storage** — same stack we already trust, and
storage egress is small compared to the DB row volume. Revisit if costs
spike or we outgrow Supabase.

## Schema

New table `note_attachments` (per-note bag, ordered):

```sql
CREATE TABLE note_attachments (
  id            text PRIMARY KEY DEFAULT 'att_' || gen_random_uuid()::text,
  note_id       text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  content_type  text NOT NULL,
  size_bytes    integer NOT NULL,
  sha256        text NOT NULL,
  storage_key   text NOT NULL,                  -- bucket-relative path
  uploaded_by   text NOT NULL REFERENCES users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  position      integer NOT NULL DEFAULT 0      -- display ordering inside the note
);
CREATE INDEX note_attachments_note_idx ON note_attachments(note_id);
```

- `storage_key` is opaque; the storage layer owns the path format. For
  Supabase Storage: `notes/{note_id}/{att_id}/{filename}`.
- `sha256` lets the UI dedupe and lets the EHR push include
  `Attachment.hash` (FHIR base64-encoded SHA1, but we'll lift to SHA256
  and downgrade or include both).
- Soft delete: rely on the note's `status = entered-in-error` cascade.
  No separate flag on attachments.

## Upload flow

1. `POST /api/notes/{id}/attachments/upload-init` → server issues a
   presigned PUT URL (Supabase Storage `createSignedUploadUrl`) and
   returns `{ uploadUrl, headers, storageKey, attachmentId }`.
2. Browser PUTs the file directly to Supabase Storage.
3. `POST /api/notes/{id}/attachments/{attId}/confirm` → server reads
   object metadata, computes/verifies sha256, writes the row.

Splitting init / confirm keeps a half-finished upload from leaving a
DB row pointing at nothing, and means the server never streams the
file. The confirm step doubles as the AV-hook point if/when we wire
one in.

### Limits and validation

- Max 25 MB per file, max 5 files per note.
- Allowed `content-type`: `image/png`, `image/jpeg`, `application/pdf`.
- Filename validated for path-traversal characters; the storage_key
  is server-generated regardless.
- Bucket policy: signed URLs only; no public reads.

## Download

`GET /api/notes/{id}/attachments/{attId}` → 302 to a short-lived (60s)
signed download URL. Audit log entry per request. No streaming through
the api-server.

## FHIR DocumentReference mapping

The current push sends `content: [{ attachment: { contentType: "text/plain", text: <note body> } }]`.
With attachments, the array grows:

```ts
content: [
  { attachment: { contentType: "text/plain",       text:        noteBody                   } },
  { attachment: { contentType: "image/jpeg",       url:         signedAttachmentUrl,
                  size:        sizeBytes,         hash:        base64Sha256,
                  title:       filename                                                    } },
  // …one entry per attachment
],
```

Open questions:

- Athena vs Epic: both accept `Attachment.url` per R4, but some
  installations expect inline base64 (`Attachment.data`) for binary
  payloads. Hit each sandbox before promising one shape.
- Signed-URL lifetime: needs to outlive whatever the EHR's import job
  needs (typically minutes). 15-minute signed URLs are a safe default.
- Hash: FHIR R4 nominally specifies SHA1. We compute SHA256 server-side
  for integrity; downgrade for the FHIR field, or include both via an
  extension. Lean toward "include SHA256 only" and let the EHR ignore it.

## Frontend

- NewNote / Note pages get an "Attach" button → file picker (multiple
  selection allowed).
- Inline drag-and-drop on the body textarea.
- Thumbnails for images, generic icon for PDFs.
- Progress indicator per file; failed uploads stay attached as a retry-able row.
- Print view shows filename + size only (no inline render — keeps the
  printed page small and avoids surprise PHI on paper).

## What I need from you

1. **Storage**: Supabase Storage, S3, or defer?
2. **MIME allow-list OK?** (PNG / JPEG / PDF) or do you want HEIC / TIFF / DICOM later?
3. **AV scanning required at upload time?** (Adds a moderate amount of glue — ClamAV in a worker, or a managed scanner.)

Once those land, the schema + routes + UI here are ~1.5 days of focused work.
