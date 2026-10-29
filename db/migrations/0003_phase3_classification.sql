-- Phase 3 Migration: Deterministic Classification Engine, Review Queue & Tags
CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "name" text NOT NULL,
  "rule_type" text NOT NULL,
  "pattern" text NOT NULL,
  "target_category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "target_subcategory_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "confidence_score" text DEFAULT '0.94' NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'owner' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "classification_rules_owner_idx" ON "classification_rules" ("owner_id");
CREATE INDEX IF NOT EXISTS "classification_rules_target_cat_idx" ON "classification_rules" ("target_category_id");

CREATE TABLE IF NOT EXISTS "classification_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "subcategory_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "classification_method" text NOT NULL,
  "confidence" text NOT NULL,
  "matched_rule_ids_json" text DEFAULT '[]' NOT NULL,
  "evidence_json" text DEFAULT '[]' NOT NULL,
  "ruleset_version" text DEFAULT 'phase3-deterministic-v1' NOT NULL,
  "requires_review" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "classification_decisions_bookmark_idx" ON "classification_decisions" ("bookmark_id");
CREATE INDEX IF NOT EXISTS "classification_decisions_owner_idx" ON "classification_decisions" ("owner_id");

CREATE TABLE IF NOT EXISTS "classification_review_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "suggested_category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "suggested_subcategory_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "confidence" text DEFAULT '0.00' NOT NULL,
  "review_reason" text NOT NULL,
  "evidence_json" text DEFAULT '[]' NOT NULL,
  "source_folder_path_json" text DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);

CREATE INDEX IF NOT EXISTS "classification_review_owner_status_idx" ON "classification_review_queue" ("owner_id", "status");
CREATE INDEX IF NOT EXISTS "classification_review_bookmark_idx" ON "classification_review_queue" ("bookmark_id");

CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_owner_normalized_name_idx" ON "tags" ("owner_id", "normalized_name");
CREATE INDEX IF NOT EXISTS "tags_owner_idx" ON "tags" ("owner_id");

CREATE TABLE IF NOT EXISTS "bookmark_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "bookmark_tags_bookmark_tag_idx" ON "bookmark_tags" ("bookmark_id", "tag_id");
CREATE INDEX IF NOT EXISTS "bookmark_tags_owner_idx" ON "bookmark_tags" ("owner_id");
