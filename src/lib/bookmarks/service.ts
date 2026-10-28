import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { bookmarkPlacements, bookmarks, categories } from '../../db/schema.ts';
import {
  fallbackCreateCategory,
  fallbackDeleteBookmark,
  fallbackEnsureSeeded,
  fallbackFindByNormalizedKey,
  fallbackGetCategories,
  fallbackHydrateBookmarks,
  fallbackInsertBookmark,
  fallbackUpdateBookmark,
} from '../../db/server-store.ts';
import type {
  BookmarkRecord,
  CategoryAssignmentSource,
  DashboardSummary,
} from '../../types/bookmark.ts';
import {
  InvalidBookmarkUrlError,
  normalizeBookmarkUrl,
  resolveCategoryAssignment,
} from './url-identity.ts';

export class DuplicateBookmarkError extends Error {
  public readonly existingBookmark: BookmarkRecord;
  public readonly normalizedUrlKey: string;

  constructor(existingBookmark: BookmarkRecord, normalizedUrlKey: string) {
    super(
      `Duplicate full URL detected: "${normalizedUrlKey}" is already saved as "${existingBookmark.title}".`
    );
    this.name = 'DuplicateBookmarkError';
    this.existingBookmark = existingBookmark;
    this.normalizedUrlKey = normalizedUrlKey;
  }
}

export class BookmarkNotFoundError extends Error {
  constructor(message = 'Bookmark not found.') {
    super(message);
    this.name = 'BookmarkNotFoundError';
  }
}

declare global {
  var _seededOwners: Set<string> | undefined;
}

function getSeededOwnersSet(): Set<string> {
  if (!global._seededOwners) {
    global._seededOwners = new Set<string>();
  }
  return global._seededOwners;
}

const STARTER_BOOKMARKS = [
  {
    url: 'https://nextjs.org/docs/app/building-your-application/routing',
    title: 'Next.js App Router Architecture Guide',
    description:
      'Official documentation for nested layouts, server components, and route handlers.',
    notes: 'Primary reference for Phase 1 application shell and API route design.',
    isFavorite: true,
    catKey: 'fe' as const,
  },
  {
    url: 'https://orm.drizzle.team/docs/overview',
    title: 'Drizzle ORM PostgreSQL Documentation',
    description:
      'Type-safe SQL query builder and schema migration toolkit for PostgreSQL.',
    notes: 'Used with parameterized queries and partial unique indexes.',
    isFavorite: true,
    catKey: 'db' as const,
  },
  {
    url: 'https://orm.drizzle.team/docs/indexes-constraints',
    title: 'Drizzle ORM Indexes & Constraints Reference',
    description:
      'Same domain as Drizzle overview, distinct full URL path — preserved as a separate canonical bookmark.',
    notes: 'Demonstrates conservative full-URL identity (never domain-only deduplication).',
    isFavorite: false,
    catKey: 'db' as const,
  },
  {
    url: 'https://url.spec.whatwg.org/',
    title: 'WHATWG URL Living Standard',
    description:
      'Specification for URL parsing, host canonicalization, and path normalization.',
    notes: 'Reference for conservative URL identity normalization rules.',
    isFavorite: false,
    catKey: 'research' as const,
  },
];

export async function ensureOwnerSeedData(ownerId: string): Promise<void> {
  if (!process.env.SQL_HOST) {
    fallbackEnsureSeeded(ownerId, () => {
      const engCat = fallbackCreateCategory(ownerId, {
        name: 'Engineering',
        parentCategoryId: null,
        sortOrder: 0,
      });
      const feSubCat = fallbackCreateCategory(ownerId, {
        name: 'Frontend & Next.js',
        parentCategoryId: engCat.id,
        sortOrder: 1,
      });
      const dbSubCat = fallbackCreateCategory(ownerId, {
        name: 'Database & SQL',
        parentCategoryId: engCat.id,
        sortOrder: 2,
      });
      const researchCat = fallbackCreateCategory(ownerId, {
        name: 'Research & Reading',
        parentCategoryId: null,
        sortOrder: 3,
      });

      const catLookup = {
        fe: feSubCat.id,
        db: dbSubCat.id,
        research: researchCat.id,
      };

      for (const item of STARTER_BOOKMARKS) {
        const normalized = normalizeBookmarkUrl(item.url);
        const assignment = resolveCategoryAssignment(catLookup[item.catKey]);
        fallbackInsertBookmark(ownerId, {
          originalUrl: normalized.originalUrl,
          normalizedUrlKey: normalized.normalizedUrlKey,
          domain: normalized.domain,
          title: item.title,
          description: item.description,
          notes: item.notes,
          isFavorite: item.isFavorite,
          primaryCategoryId: assignment.primaryCategoryId,
          categorySource: assignment.categorySource,
          categoryLocked: assignment.categoryLocked,
        });
      }
    });
    return;
  }

  const seededSet = getSeededOwnersSet();
  if (seededSet.has(ownerId)) {
    return;
  }

  try {
    const [existingCats, existingBookmarks] = await Promise.all([
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.ownerId, ownerId))
        .limit(1),
      db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.ownerId, ownerId))
        .limit(1),
    ]);

    if (existingCats.length > 0 || existingBookmarks.length > 0) {
      seededSet.add(ownerId);
      return;
    }

    await db.transaction(async (tx) => {
      const [engCat] = await tx
        .insert(categories)
        .values({
          ownerId,
          name: 'Engineering',
          parentCategoryId: null,
          sortOrder: 0,
        })
        .returning();

      const [feSubCat] = await tx
        .insert(categories)
        .values({
          ownerId,
          name: 'Frontend & Next.js',
          parentCategoryId: engCat.id,
          sortOrder: 1,
        })
        .returning();

      const [dbSubCat] = await tx
        .insert(categories)
        .values({
          ownerId,
          name: 'Database & SQL',
          parentCategoryId: engCat.id,
          sortOrder: 2,
        })
        .returning();

      const [researchCat] = await tx
        .insert(categories)
        .values({
          ownerId,
          name: 'Research & Reading',
          parentCategoryId: null,
          sortOrder: 3,
        })
        .returning();

      const catLookup = {
        fe: feSubCat.id,
        db: dbSubCat.id,
        research: researchCat.id,
      };

      for (const item of STARTER_BOOKMARKS) {
        const normalized = normalizeBookmarkUrl(item.url);
        const assignment = resolveCategoryAssignment(catLookup[item.catKey]);

        const [created] = await tx
          .insert(bookmarks)
          .values({
            ownerId,
            originalUrl: normalized.originalUrl,
            normalizedUrlKey: normalized.normalizedUrlKey,
            domain: normalized.domain,
            title: item.title,
            description: item.description,
            notes: item.notes,
            isFavorite: item.isFavorite,
            primaryCategoryId: assignment.primaryCategoryId,
            categorySource: assignment.categorySource,
            categoryLocked: assignment.categoryLocked,
          })
          .returning();

        if (assignment.primaryCategoryId) {
          await tx.insert(bookmarkPlacements).values({
            ownerId,
            bookmarkId: created.id,
            categoryId: assignment.primaryCategoryId,
            isPrimary: true,
            assignmentSource: 'manual',
            isLocked: true,
          });
        }
      }
    });

    seededSet.add(ownerId);
  } catch (error) {
    console.error('Failed to initialize starter owner data:', error);
  }
}

async function hydrateBookmarks(
  ownerId: string,
  rows: (typeof bookmarks.$inferSelect)[]
): Promise<BookmarkRecord[]> {
  if (rows.length === 0) return [];

  const catRows = await db
    .select()
    .from(categories)
    .where(eq(categories.ownerId, ownerId));

  const catMap = new Map(catRows.map((c) => [c.id, c]));

  return rows.map((row) => {
    const primaryCat = row.primaryCategoryId
      ? catMap.get(row.primaryCategoryId) ?? null
      : null;
    const parentCat =
      primaryCat && primaryCat.parentCategoryId
        ? catMap.get(primaryCat.parentCategoryId) ?? null
        : null;

    return {
      id: row.id,
      ownerId: row.ownerId,
      originalUrl: row.originalUrl,
      normalizedUrlKey: row.normalizedUrlKey,
      domain: row.domain,
      title: row.title,
      description: row.description ?? null,
      notes: row.notes ?? null,
      isFavorite: row.isFavorite,
      primaryCategoryId: row.primaryCategoryId ?? null,
      primaryCategoryName: primaryCat ? primaryCat.name : null,
      parentCategoryId: parentCat ? parentCat.id : null,
      parentCategoryName: parentCat ? parentCat.name : null,
      categorySource: (row.categorySource as CategoryAssignmentSource) || 'uncategorized',
      categoryLocked: row.categoryLocked,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

function filterBookmarkList(
  hydrated: BookmarkRecord[],
  options?: {
    categoryId?: string | null;
    favoriteOnly?: boolean;
    uncategorizedOnly?: boolean;
    search?: string;
  }
): BookmarkRecord[] {
  return hydrated.filter((b) => {
    if (options?.favoriteOnly && !b.isFavorite) {
      return false;
    }
    if (options?.uncategorizedOnly && b.primaryCategoryId !== null) {
      return false;
    }
    if (options?.categoryId) {
      const matchesDirect = b.primaryCategoryId === options.categoryId;
      const matchesParent = b.parentCategoryId === options.categoryId;
      if (!matchesDirect && !matchesParent) {
        return false;
      }
    }
    if (options?.search && options.search.trim().length > 0) {
      const q = options.search.trim().toLowerCase();
      const hay = [
        b.title,
        b.domain,
        b.originalUrl,
        b.description ?? '',
        b.notes ?? '',
        b.primaryCategoryName ?? '',
        b.parentCategoryName ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export async function listBookmarksForOwner(
  ownerId: string,
  options?: {
    categoryId?: string | null;
    favoriteOnly?: boolean;
    uncategorizedOnly?: boolean;
    search?: string;
  }
): Promise<BookmarkRecord[]> {
  try {
    if (!process.env.SQL_HOST) {
      const hydrated = fallbackHydrateBookmarks(ownerId);
      return filterBookmarkList(hydrated, options);
    }

    const rows = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.ownerId, ownerId))
      .orderBy(desc(bookmarks.createdAt));

    const hydrated = await hydrateBookmarks(ownerId, rows);
    return filterBookmarkList(hydrated, options);
  } catch (error) {
    console.error('Database query failed in listBookmarksForOwner:', error);
    throw new Error('Failed to load bookmarks from database.', { cause: error });
  }
}

export async function getDashboardSummaryForOwner(
  ownerId: string
): Promise<DashboardSummary> {
  try {
    const allBookmarks = await listBookmarksForOwner(ownerId);
    const totalCategories = !process.env.SQL_HOST
      ? fallbackGetCategories(ownerId).length
      : (
          await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.ownerId, ownerId))
        ).length;

    const favoritesCount = allBookmarks.filter((b) => b.isFavorite).length;
    const manualLockedCount = allBookmarks.filter((b) => b.categoryLocked).length;
    const uncategorizedCount = allBookmarks.filter(
      (b) => !b.primaryCategoryId
    ).length;

    return {
      totalBookmarks: allBookmarks.length,
      totalCategories,
      favoritesCount,
      manualLockedCount,
      uncategorizedCount,
      recentBookmarks: allBookmarks.slice(0, 6),
    };
  } catch (error) {
    console.error('Database query failed in getDashboardSummaryForOwner:', error);
    throw new Error('Failed to load dashboard statistics.', { cause: error });
  }
}

export async function createBookmarkForOwner(
  ownerId: string,
  input: {
    url: string;
    title?: string | null;
    description?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    isFavorite?: boolean;
  }
): Promise<BookmarkRecord> {
  const normalized = normalizeBookmarkUrl(input.url);

  try {
    if (!process.env.SQL_HOST) {
      const existing = fallbackFindByNormalizedKey(
        ownerId,
        normalized.normalizedUrlKey
      );
      if (existing) {
        throw new DuplicateBookmarkError(existing, normalized.normalizedUrlKey);
      }

      const ownerCats = fallbackGetCategories(ownerId);
      const validCat =
        input.categoryId && input.categoryId.trim().length > 0
          ? ownerCats.find((c) => c.id === input.categoryId!.trim())?.id ?? null
          : null;

      const assignment = resolveCategoryAssignment(validCat);
      const finalTitle =
        input.title && input.title.trim().length > 0
          ? input.title.trim()
          : normalized.fallbackTitle;

      return fallbackInsertBookmark(ownerId, {
        originalUrl: normalized.originalUrl,
        normalizedUrlKey: normalized.normalizedUrlKey,
        domain: normalized.domain,
        title: finalTitle,
        description:
          input.description && input.description.trim().length > 0
            ? input.description.trim()
            : null,
        notes:
          input.notes && input.notes.trim().length > 0
            ? input.notes.trim()
            : null,
        isFavorite: Boolean(input.isFavorite),
        primaryCategoryId: assignment.primaryCategoryId,
        categorySource: assignment.categorySource,
        categoryLocked: assignment.categoryLocked,
      });
    }

    const existingRows = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.ownerId, ownerId),
          eq(bookmarks.normalizedUrlKey, normalized.normalizedUrlKey)
        )
      )
      .limit(1);

    if (existingRows.length > 0) {
      const [hydratedExisting] = await hydrateBookmarks(ownerId, existingRows);
      throw new DuplicateBookmarkError(
        hydratedExisting,
        normalized.normalizedUrlKey
      );
    }

    let validCategoryId: string | null = null;
    if (input.categoryId && input.categoryId.trim().length > 0) {
      const catCheck = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId.trim()),
            eq(categories.ownerId, ownerId)
          )
        )
        .limit(1);
      if (catCheck.length > 0) {
        validCategoryId = catCheck[0].id;
      }
    }

    const assignment = resolveCategoryAssignment(validCategoryId);
    const finalTitle =
      input.title && input.title.trim().length > 0
        ? input.title.trim()
        : normalized.fallbackTitle;

    const insertedRow = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(bookmarks)
        .values({
          ownerId,
          originalUrl: normalized.originalUrl,
          normalizedUrlKey: normalized.normalizedUrlKey,
          domain: normalized.domain,
          title: finalTitle,
          description:
            input.description && input.description.trim().length > 0
              ? input.description.trim()
              : null,
          notes:
            input.notes && input.notes.trim().length > 0
              ? input.notes.trim()
              : null,
          isFavorite: Boolean(input.isFavorite),
          primaryCategoryId: assignment.primaryCategoryId,
          categorySource: assignment.categorySource,
          categoryLocked: assignment.categoryLocked,
        })
        .returning();

      if (assignment.primaryCategoryId) {
        await tx.insert(bookmarkPlacements).values({
          ownerId,
          bookmarkId: created.id,
          categoryId: assignment.primaryCategoryId,
          isPrimary: true,
          assignmentSource: 'manual',
          isLocked: true,
        });
      }

      return created;
    });

    const [hydrated] = await hydrateBookmarks(ownerId, [insertedRow]);
    return hydrated;
  } catch (error) {
    if (
      error instanceof DuplicateBookmarkError ||
      error instanceof InvalidBookmarkUrlError
    ) {
      throw error;
    }
    console.error('Database insert failed in createBookmarkForOwner:', error);
    throw new Error('Failed to save bookmark to database.', { cause: error });
  }
}

export async function updateBookmarkForOwner(
  ownerId: string,
  bookmarkId: string,
  input: {
    url?: string;
    title?: string | null;
    description?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    isFavorite?: boolean;
  }
): Promise<BookmarkRecord> {
  try {
    if (!process.env.SQL_HOST) {
      const all = fallbackHydrateBookmarks(ownerId);
      const current = all.find((b) => b.id === bookmarkId);
      if (!current) {
        throw new BookmarkNotFoundError();
      }

      let originalUrl = current.originalUrl;
      let normalizedUrlKey = current.normalizedUrlKey;
      let domain = current.domain;
      let fallbackTitle = current.title;

      if (input.url !== undefined) {
        const normalized = normalizeBookmarkUrl(input.url);
        originalUrl = normalized.originalUrl;
        normalizedUrlKey = normalized.normalizedUrlKey;
        domain = normalized.domain;
        fallbackTitle = normalized.fallbackTitle;

        if (normalizedUrlKey !== current.normalizedUrlKey) {
          const conflict = fallbackFindByNormalizedKey(ownerId, normalizedUrlKey);
          if (conflict && conflict.id !== bookmarkId) {
            throw new DuplicateBookmarkError(conflict, normalizedUrlKey);
          }
        }
      }

      const ownerCats = fallbackGetCategories(ownerId);
      let primaryCategoryId = current.primaryCategoryId;
      let categorySource = current.categorySource;
      let categoryLocked = current.categoryLocked;

      if (input.categoryId !== undefined) {
        const requestedCatId =
          input.categoryId && input.categoryId.trim().length > 0
            ? input.categoryId.trim()
            : null;
        if (requestedCatId !== current.primaryCategoryId) {
          if (requestedCatId) {
            const validCat =
              ownerCats.find((c) => c.id === requestedCatId)?.id ?? null;
            const assignment = resolveCategoryAssignment(validCat);
            primaryCategoryId = assignment.primaryCategoryId;
            categorySource = assignment.categorySource;
            categoryLocked = assignment.categoryLocked;
          } else {
            primaryCategoryId = null;
            categorySource = 'uncategorized';
            categoryLocked = false;
          }
        }
      }

      const updated = fallbackUpdateBookmark(ownerId, bookmarkId, () => ({
        originalUrl,
        normalizedUrlKey,
        domain,
        title:
          input.title !== undefined
            ? input.title && input.title.trim().length > 0
              ? input.title.trim()
              : fallbackTitle
            : current.title,
        description:
          input.description !== undefined
            ? input.description && input.description.trim().length > 0
              ? input.description.trim()
              : null
            : current.description,
        notes:
          input.notes !== undefined
            ? input.notes && input.notes.trim().length > 0
              ? input.notes.trim()
              : null
            : current.notes,
        isFavorite:
          input.isFavorite !== undefined
            ? Boolean(input.isFavorite)
            : current.isFavorite,
        primaryCategoryId,
        categorySource,
        categoryLocked,
      }));

      if (!updated) {
        throw new BookmarkNotFoundError();
      }
      return updated;
    }

    const existingRows = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.ownerId, ownerId)))
      .limit(1);

    if (existingRows.length === 0) {
      throw new BookmarkNotFoundError();
    }

    const current = existingRows[0];

    let originalUrl = current.originalUrl;
    let normalizedUrlKey = current.normalizedUrlKey;
    let domain = current.domain;
    let fallbackTitle = current.title;

    if (input.url !== undefined) {
      const normalized = normalizeBookmarkUrl(input.url);
      originalUrl = normalized.originalUrl;
      normalizedUrlKey = normalized.normalizedUrlKey;
      domain = normalized.domain;
      fallbackTitle = normalized.fallbackTitle;

      if (normalizedUrlKey !== current.normalizedUrlKey) {
        const conflictRows = await db
          .select()
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.ownerId, ownerId),
              eq(bookmarks.normalizedUrlKey, normalizedUrlKey)
            )
          )
          .limit(1);

        if (conflictRows.length > 0 && conflictRows[0].id !== bookmarkId) {
          const [hydratedConflict] = await hydrateBookmarks(ownerId, conflictRows);
          throw new DuplicateBookmarkError(hydratedConflict, normalizedUrlKey);
        }
      }
    }

    let primaryCategoryId = current.primaryCategoryId;
    let categorySource = current.categorySource;
    let categoryLocked = current.categoryLocked;
    let categoryChanged = false;

    if (input.categoryId !== undefined) {
      const requestedCatId =
        input.categoryId && input.categoryId.trim().length > 0
          ? input.categoryId.trim()
          : null;

      if (requestedCatId !== current.primaryCategoryId) {
        categoryChanged = true;
        if (requestedCatId) {
          const catCheck = await db
            .select()
            .from(categories)
            .where(
              and(
                eq(categories.id, requestedCatId),
                eq(categories.ownerId, ownerId)
              )
            )
            .limit(1);
          const assignment = resolveCategoryAssignment(
            catCheck.length > 0 ? catCheck[0].id : null
          );
          primaryCategoryId = assignment.primaryCategoryId;
          categorySource = assignment.categorySource;
          categoryLocked = assignment.categoryLocked;
        } else {
          primaryCategoryId = null;
          categorySource = 'uncategorized';
          categoryLocked = false;
        }
      }
    }

    const nextTitle =
      input.title !== undefined
        ? input.title && input.title.trim().length > 0
          ? input.title.trim()
          : fallbackTitle
        : current.title;

    const nextDescription =
      input.description !== undefined
        ? input.description && input.description.trim().length > 0
          ? input.description.trim()
          : null
        : current.description;

    const nextNotes =
      input.notes !== undefined
        ? input.notes && input.notes.trim().length > 0
          ? input.notes.trim()
          : null
        : current.notes;

    const nextFavorite =
      input.isFavorite !== undefined ? Boolean(input.isFavorite) : current.isFavorite;

    const updatedRow = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(bookmarks)
        .set({
          originalUrl,
          normalizedUrlKey,
          domain,
          title: nextTitle,
          description: nextDescription,
          notes: nextNotes,
          isFavorite: nextFavorite,
          primaryCategoryId,
          categorySource,
          categoryLocked,
          updatedAt: new Date(),
        })
        .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.ownerId, ownerId)))
        .returning();

      if (categoryChanged) {
        await tx
          .delete(bookmarkPlacements)
          .where(
            and(
              eq(bookmarkPlacements.bookmarkId, bookmarkId),
              eq(bookmarkPlacements.isPrimary, true)
            )
          );

        if (primaryCategoryId) {
          await tx
            .insert(bookmarkPlacements)
            .values({
              ownerId,
              bookmarkId,
              categoryId: primaryCategoryId,
              isPrimary: true,
              assignmentSource: 'manual',
              isLocked: true,
            })
            .onConflictDoUpdate({
              target: [
                bookmarkPlacements.bookmarkId,
                bookmarkPlacements.categoryId,
              ],
              set: {
                isPrimary: true,
                assignmentSource: 'manual',
                isLocked: true,
                updatedAt: new Date(),
              },
            });
        }
      }

      return updated;
    });

    const [hydrated] = await hydrateBookmarks(ownerId, [updatedRow]);
    return hydrated;
  } catch (error) {
    if (
      error instanceof DuplicateBookmarkError ||
      error instanceof InvalidBookmarkUrlError ||
      error instanceof BookmarkNotFoundError
    ) {
      throw error;
    }
    console.error('Database update failed in updateBookmarkForOwner:', error);
    throw new Error('Failed to update bookmark in database.', { cause: error });
  }
}

export async function deleteBookmarkForOwner(
  ownerId: string,
  bookmarkId: string
): Promise<void> {
  try {
    if (!process.env.SQL_HOST) {
      const ok = fallbackDeleteBookmark(ownerId, bookmarkId);
      if (!ok) {
        throw new BookmarkNotFoundError();
      }
      return;
    }

    const deleted = await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.ownerId, ownerId)))
      .returning({ id: bookmarks.id });

    if (deleted.length === 0) {
      throw new BookmarkNotFoundError();
    }
  } catch (error) {
    if (error instanceof BookmarkNotFoundError) {
      throw error;
    }
    console.error('Database delete failed in deleteBookmarkForOwner:', error);
    throw new Error('Failed to delete bookmark from database.', { cause: error });
  }
}
