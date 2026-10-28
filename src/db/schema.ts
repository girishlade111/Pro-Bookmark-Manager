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
