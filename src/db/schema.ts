import { relations, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    parentCategoryId: uuid('parent_category_id').references(
      (): AnyPgColumn => categories.id,
      { onDelete: 'cascade' }
    ),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('categories_owner_idx').on(table.ownerId),
    index('categories_parent_idx').on(table.parentCategoryId),
  ]
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    originalUrl: text('original_url').notNull(),
    normalizedUrlKey: text('normalized_url_key').notNull(),
    domain: text('domain').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    notes: text('notes'),
    isFavorite: boolean('is_favorite').default(false).notNull(),
    primaryCategoryId: uuid('primary_category_id').references(
      () => categories.id,
      { onDelete: 'set null' }
    ),
    categorySource: text('category_source').default('uncategorized').notNull(),
    categoryLocked: boolean('category_locked').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('bookmarks_owner_normalized_url_idx').on(
      table.ownerId,
      table.normalizedUrlKey
    ),
    index('bookmarks_owner_created_idx').on(table.ownerId, table.createdAt),
    index('bookmarks_primary_category_idx').on(table.primaryCategoryId),
  ]
);

export const bookmarkPlacements = pgTable(
  'bookmark_placements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    bookmarkId: uuid('bookmark_id')
      .references(() => bookmarks.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    assignmentSource: text('assignment_source').default('manual').notNull(),
    isLocked: boolean('is_locked').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('bookmark_placements_bookmark_category_idx').on(
      table.bookmarkId,
      table.categoryId
    ),
    uniqueIndex('bookmark_single_primary_placement_idx')
      .on(table.bookmarkId)
      .where(sql`${table.isPrimary} = true`),
    index('bookmark_placements_owner_idx').on(table.ownerId),
  ]
);

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    originalFilename: text('original_filename').notNull(),
    sourceBrowser: text('source_browser'),
    fileHash: text('file_hash').notNull(),
    status: text('status').default('preview').notNull(),
    normalizationVersion: text('normalization_version')
      .default('v1-conservative-full-url')
      .notNull(),
    destinationCategoryId: uuid('destination_category_id').references(
      () => categories.id,
      { onDelete: 'set null' }
    ),
    conflictStrategy: text('conflict_strategy')
      .default('keep_existing')
      .notNull(),
    filesCount: integer('files_count').default(1).notNull(),
    totalParsedEntries: integer('total_parsed_entries').default(0).notNull(),
    uniqueUploadIdentities: integer('unique_upload_identities')
      .default(0)
      .notNull(),
    withinUploadDuplicates: integer('within_upload_duplicates')
      .default(0)
      .notNull(),
    existingDbDuplicates: integer('existing_db_duplicates')
      .default(0)
      .notNull(),
    newCanonicalBookmarks: integer('new_canonical_bookmarks')
      .default(0)
      .notNull(),
    exactDuplicates: integer('exact_duplicates').default(0).notNull(),
    invalidRecords: integer('invalid_records').default(0).notNull(),
    missingTitlesCount: integer('missing_titles_count').default(0).notNull(),
    categoryConflictsCount: integer('category_conflicts_count')
      .default(0)
      .notNull(),
    warningCount: integer('warning_count').default(0).notNull(),
    previewTokenHash: text('preview_token_hash'),
    idempotencyKey: text('idempotency_key').unique(),
    stagedPayloadJson: text('staged_payload_json'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('import_jobs_owner_created_idx').on(table.ownerId, table.createdAt),
  ]
);

export const importOccurrences = pgTable(
  'import_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    importJobId: uuid('import_job_id')
      .references(() => importJobs.id, { onDelete: 'cascade' })
      .notNull(),
    canonicalBookmarkId: uuid('canonical_bookmark_id').references(
      () => bookmarks.id,
      { onDelete: 'set null' }
    ),
    occurrenceIndex: integer('occurrence_index').notNull(),
    sourceFilename: text('source_filename').notNull(),
    originalUrl: text('original_url').notNull(),
    normalizedUrlKey: text('normalized_url_key'),
    originalTitle: text('original_title').notNull(),
    displayTitle: text('display_title').notNull(),
    folderPathJson: text('folder_path_json').notNull(),
    addDate: text('add_date'),
    lastModified: text('last_modified'),
    sourceBrowser: text('source_browser'),
    sourceOrder: integer('source_order').notNull(),
    resolutionStatus: text('resolution_status').notNull(),
    warningsJson: text('warnings_json'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('import_occurrences_job_index_idx').on(
      table.importJobId,
      table.occurrenceIndex
    ),
    index('import_occurrences_owner_idx').on(table.ownerId),
    index('import_occurrences_bookmark_idx').on(table.canonicalBookmarkId),
  ]
);

export const classificationRules = pgTable(
  'classification_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    ruleType: text('rule_type').notNull(), // 'exact_url' | 'path_prefix' | 'hostname' | 'subdomain' | 'folder_mapping' | 'title_keyword'
    pattern: text('pattern').notNull(),
    targetCategoryId: uuid('target_category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    targetSubcategoryId: uuid('target_subcategory_id').references(
      () => categories.id,
      { onDelete: 'set null' }
    ),
    priority: integer('priority').default(100).notNull(),
    confidenceScore: text('confidence_score').default('0.94').notNull(),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    source: text('source').default('owner').notNull(), // 'owner' | 'system_seed'
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('classification_rules_owner_idx').on(table.ownerId),
    index('classification_rules_target_cat_idx').on(table.targetCategoryId),
  ]
);

export const classificationDecisions = pgTable(
  'classification_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    bookmarkId: uuid('bookmark_id')
      .references(() => bookmarks.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    subcategoryId: uuid('subcategory_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    classificationMethod: text('classification_method').notNull(), // 'manual' | 'auto_classified' | 'suggested' | 'needs_review'
    confidence: text('confidence').notNull(),
    matchedRuleIdsJson: text('matched_rule_ids_json').default('[]').notNull(),
    evidenceJson: text('evidence_json').default('[]').notNull(),
    rulesetVersion: text('ruleset_version')
      .default('phase3-deterministic-v1')
      .notNull(),
    requiresReview: boolean('requires_review').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('classification_decisions_bookmark_idx').on(table.bookmarkId),
    index('classification_decisions_owner_idx').on(table.ownerId),
  ]
);

export const classificationReviewQueue = pgTable(
  'classification_review_queue',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    bookmarkId: uuid('bookmark_id')
      .references(() => bookmarks.id, { onDelete: 'cascade' })
      .notNull(),
    suggestedCategoryId: uuid('suggested_category_id').references(
      () => categories.id,
      { onDelete: 'set null' }
    ),
    suggestedSubcategoryId: uuid('suggested_subcategory_id').references(
      () => categories.id,
      { onDelete: 'set null' }
    ),
    confidence: text('confidence').default('0.00').notNull(),
    reviewReason: text('review_reason').notNull(),
    evidenceJson: text('evidence_json').default('[]').notNull(),
    sourceFolderPathJson: text('source_folder_path_json')
      .default('[]')
      .notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'corrected' | 'kept_uncategorized' | 'dismissed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    index('classification_review_owner_status_idx').on(
      table.ownerId,
      table.status
    ),
    index('classification_review_bookmark_idx').on(table.bookmarkId),
  ]
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tags_owner_normalized_name_idx').on(
      table.ownerId,
      table.normalizedName
    ),
    index('tags_owner_idx').on(table.ownerId),
  ]
);

export const bookmarkTags = pgTable(
  'bookmark_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    bookmarkId: uuid('bookmark_id')
      .references(() => bookmarks.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
    source: text('source').default('manual').notNull(), // 'manual' | 'auto_rule'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('bookmark_tags_bookmark_tag_idx').on(
      table.bookmarkId,
      table.tagId
    ),
    index('bookmark_tags_owner_idx').on(table.ownerId),
  ]
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parentCategory: one(categories, {
    fields: [categories.parentCategoryId],
    references: [categories.id],
    relationName: 'category_hierarchy',
  }),
  subcategories: many(categories, {
    relationName: 'category_hierarchy',
  }),
  primaryBookmarks: many(bookmarks),
  placements: many(bookmarkPlacements),
}));

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  primaryCategory: one(categories, {
    fields: [bookmarks.primaryCategoryId],
    references: [categories.id],
  }),
  placements: many(bookmarkPlacements),
  importOccurrences: many(importOccurrences),
  classificationDecisions: many(classificationDecisions),
  reviewItems: many(classificationReviewQueue),
  bookmarkTags: many(bookmarkTags),
}));

export const bookmarkPlacementsRelations = relations(
  bookmarkPlacements,
  ({ one }) => ({
    bookmark: one(bookmarks, {
      fields: [bookmarkPlacements.bookmarkId],
      references: [bookmarks.id],
    }),
    category: one(categories, {
      fields: [bookmarkPlacements.categoryId],
      references: [categories.id],
    }),
  })
);

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  destinationCategory: one(categories, {
    fields: [importJobs.destinationCategoryId],
    references: [categories.id],
  }),
  occurrences: many(importOccurrences),
}));

export const importOccurrencesRelations = relations(
  importOccurrences,
  ({ one }) => ({
    importJob: one(importJobs, {
      fields: [importOccurrences.importJobId],
      references: [importJobs.id],
    }),
    canonicalBookmark: one(bookmarks, {
      fields: [importOccurrences.canonicalBookmarkId],
      references: [bookmarks.id],
    }),
  })
);
