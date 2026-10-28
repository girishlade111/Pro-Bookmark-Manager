-- Phase 1 Initial Migration: Personal Visual Bookmark Manager
-- Entities: users, categories, bookmarks, bookmark_placements

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "uid" text NOT NULL UNIQUE,
  "email" text NOT NULL,
  "display_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "name" text NOT NULL,
  "parent_category_id" uuid REFERENCES "categories"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "categories_owner_idx" ON "categories" ("owner_id");
CREATE INDEX IF NOT EXISTS "categories_parent_idx" ON "categories" ("parent_category_id");

CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "original_url" text NOT NULL,
  "normalized_url_key" text NOT NULL,
  "domain" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "notes" text,
  "is_favorite" boolean DEFAULT false NOT NULL,
  "primary_category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "category_source" text DEFAULT 'uncategorized' NOT NULL,
  "category_locked" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "bookmarks_owner_normalized_url_idx"
  ON "bookmarks" ("owner_id", "normalized_url_key");

CREATE INDEX IF NOT EXISTS "bookmarks_owner_created_idx"
  ON "bookmarks" ("owner_id", "created_at");

CREATE INDEX IF NOT EXISTS "bookmarks_primary_category_idx"
  ON "bookmarks" ("primary_category_id");

CREATE TABLE IF NOT EXISTS "bookmark_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT true NOT NULL,
  "assignment_source" text DEFAULT 'manual' NOT NULL,
  "is_locked" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "bookmark_placements_bookmark_category_idx"
  ON "bookmark_placements" ("bookmark_id", "category_id");

CREATE UNIQUE INDEX IF NOT EXISTS "bookmark_single_primary_placement_idx"
  ON "bookmark_placements" ("bookmark_id")
  WHERE "is_primary" = true;

CREATE INDEX IF NOT EXISTS "bookmark_placements_owner_idx"
  ON "bookmark_placements" ("owner_id");
