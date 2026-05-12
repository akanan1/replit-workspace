ALTER TABLE "notes" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "replaces_note_id" text;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_replaces_note_id_notes_id_fk" FOREIGN KEY ("replaces_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;