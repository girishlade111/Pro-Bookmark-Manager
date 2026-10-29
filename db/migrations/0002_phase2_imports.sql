-- Phase 2 Additive Migration: Browser HTML Import & Provenance Tables
-- Entities: import_jobs, import_occurrences

CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "original_filename" text NOT NULL,
  "source_browser" text,
  "file_hash" text NOT NULL,
  "status" text DEFAULT 'preview' NOT NULL,
  "normalization_version" text DEFAULT 'v1-conservative-full-url' NOT NULL,
  "destination_category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "conflict_strategy" text DEFAULT 'keep_existing' NOT NULL,
  "files_count" integer DEFAULT 1 NOT NULL,
  "total_parsed_entries" integer DEFAULT 0 NOT NULL,
  "unique_upload_identities" integer DEFAULT 0 NOT NULL,
  "within_upload_duplicates" integer DEFAULT 0 NOT NULL,
  "existing_db_duplicates" integer DEFAULT 0 NOT NULL,
  "new_canonical_bookmarks" integer DEFAULT 0 NOT NULL,
  "exact_duplicates" integer DEFAULT 0 NOT NULL,
  "invalid_records" integer DEFAULT 0 NOT NULL,
  "missing_titles_count" integer DEFAULT 0 NOT NULL,
  "category_conflicts_count" integer DEFAULT 0 NOT NULL,
  "warning_count" integer DEFAULT 0 NOT NULL,
  "preview_token_hash" text,
  "idempotency_key" text UNIQUE,
  "staged_payload_json" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "import_jobs_owner_created_idx"
  ON "import_jobs" ("owner_id", "created_at");

CREATE TABLE IF NOT EXISTS "import_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "import_job_id" uuid NOT NULL REFERENCES "import_jobs"("id") ON DELETE CASCADE,
  "canonical_bookmark_id" uuid REFERENCES "bookmarks"("id") ON DELETE SET NULL,
  "occurrence_index" integer NOT NULL,
  "source_filename" text NOT NULL,
  "original_url" text NOT NULL,
  "normalized_url_key" text,
  "original_title" text NOT NULL,
  "display_title" text NOT NULL,
  "folder_path_json" text NOT NULL,
  "add_date" text,
  "last_modified" text,
  "source_browser" text,
  "source_order" integer NOT NULL,
  "resolution_status" text NOT NULL,
  "warnings_json" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "import_occurrences_job_index_idx"
  ON "import_occurrences" ("import_job_id", "occurrence_index");

CREATE INDEX IF NOT EXISTS "import_occurrences_owner_idx"
  ON "import_occurrences" ("owner_id");

CREATE INDEX IF NOT EXISTS "import_occurrences_bookmark_idx"
  ON "import_occurrences" ("canonical_bookmark_id");
