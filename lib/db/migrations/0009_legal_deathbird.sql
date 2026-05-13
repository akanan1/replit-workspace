CREATE TABLE "note_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"voice_cue" text,
	"body" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_templates_user_order_idx" ON "note_templates" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "note_templates_user_cue_uniq" ON "note_templates" USING btree ("user_id","voice_cue");