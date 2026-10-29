import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { bookmarks, categories } from '../../db/schema.ts';
import {
  fallbackCreateCategory,
  fallbackDeleteCategory,
  fallbackGetCategories,
  fallbackHydrateBookmarks,
  fallbackRenameCategory,
} from '../../db/server-store.ts';
import type { CategoryRecord, CategoryWithChildren } from '../../types/bookmark.ts';
import { ensureInitialTaxonomyForOwner } from '../classification/classification-service.ts';

export class CategoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryValidationError';
  }
}

function mapCategoryRow(row: typeof categories.$inferSelect): CategoryRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    parentCategoryId: row.parentCategoryId ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildCategoryTree(
  flat: CategoryRecord[],
  bookmarkCategoryIds: (string | null)[]
): {
  flat: CategoryRecord[];
  tree: CategoryWithChildren[];
} {
  const directCounts = new Map<string, number>();
  for (const catId of bookmarkCategoryIds) {
    if (catId) {
      directCounts.set(catId, (directCounts.get(catId) ?? 0) + 1);
    }
  }

  const mainCategories = flat.filter((c) => !c.parentCategoryId);
  const subByParent = new Map<string, CategoryRecord[]>();

  for (const c of flat) {
    if (c.parentCategoryId) {
      const list = subByParent.get(c.parentCategoryId) ?? [];
      list.push(c);
      subByParent.set(c.parentCategoryId, list);
    }
  }

  const tree: CategoryWithChildren[] = mainCategories.map((main) => {
    const subs = subByParent.get(main.id) ?? [];
    const subCountSum = subs.reduce(
      (acc, sub) => acc + (directCounts.get(sub.id) ?? 0),
      0
    );
    const directCount = directCounts.get(main.id) ?? 0;
    const totalCount = directCount + subCountSum;
    return {
      ...main,
      subcategories: subs,
      bookmarkCount: totalCount,
      directCount,
    };
  });

  return { flat, tree };
}

export async function listCategoriesForOwner(ownerId: string): Promise<{
  flat: CategoryRecord[];
  tree: CategoryWithChildren[];
}> {
  try {
    await ensureInitialTaxonomyForOwner(ownerId);

    if (!process.env.SQL_HOST) {
      const flat = fallbackGetCategories(ownerId);
      const bms = fallbackHydrateBookmarks(ownerId);
      return buildCategoryTree(
        flat,
        bms.map((b) => b.primaryCategoryId)
      );
    }

    const [catRows, bookmarkRows] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.ownerId, ownerId))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      db
        .select({
          id: bookmarks.id,
          primaryCategoryId: bookmarks.primaryCategoryId,
        })
        .from(bookmarks)
        .where(eq(bookmarks.ownerId, ownerId)),
    ]);

    const flat = catRows.map(mapCategoryRow);
    return buildCategoryTree(
      flat,
      bookmarkRows.map((b) => b.primaryCategoryId)
    );
  } catch (error) {
    console.error('Database query failed in listCategoriesForOwner:', error);
    throw new Error('Failed to load categories from database.', { cause: error });
  }
}

export async function createCategoryForOwner(
  ownerId: string,
  input: {
    name: string;
    parentCategoryId?: string | null;
    sortOrder?: number;
  }
): Promise<CategoryRecord> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new CategoryValidationError('Category name cannot be empty.');
  }

  const parentId =
    input.parentCategoryId && input.parentCategoryId.trim().length > 0
      ? input.parentCategoryId.trim()
      : null;

  try {
    const existingOwnerCategories = !process.env.SQL_HOST
      ? fallbackGetCategories(ownerId)
      : (
          await db
            .select()
            .from(categories)
            .where(eq(categories.ownerId, ownerId))
        ).map(mapCategoryRow);

    if (parentId) {
      const parent = existingOwnerCategories.find((c) => c.id === parentId);
      if (!parent) {
        throw new CategoryValidationError('Selected parent category was not found.');
      }
      if (parent.parentCategoryId) {
        throw new CategoryValidationError(
          'Subcategories can only be nested under a main category (2 levels max).'
        );
      }
    }

    const duplicateSibling = existingOwnerCategories.find(
      (c) =>
        (c.parentCategoryId ?? null) === parentId &&
        c.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicateSibling) {
      throw new CategoryValidationError(
        `A category named "${cleanName}" already exists at this level.`
      );
    }

    if (!process.env.SQL_HOST) {
      return fallbackCreateCategory(ownerId, {
        name: cleanName,
        parentCategoryId: parentId,
        sortOrder: input.sortOrder,
      });
    }

    const [inserted] = await db
      .insert(categories)
      .values({
        ownerId,
        name: cleanName,
        parentCategoryId: parentId,
        sortOrder: input.sortOrder ?? existingOwnerCategories.length,
      })
      .returning();

    return mapCategoryRow(inserted);
  } catch (error) {
    if (error instanceof CategoryValidationError) {
      throw error;
    }
    console.error('Database insert failed in createCategoryForOwner:', error);
    throw new Error('Failed to create category in database.', { cause: error });
  }
}

export async function renameCategoryForOwner(
  ownerId: string,
  categoryId: string,
  newName: string
): Promise<CategoryRecord> {
  const cleanName = (newName || '').trim();
  if (!cleanName) {
    throw new CategoryValidationError('Category name cannot be empty.');
  }

  try {
    const existingOwnerCategories = !process.env.SQL_HOST
      ? fallbackGetCategories(ownerId)
      : (
          await db
            .select()
            .from(categories)
            .where(eq(categories.ownerId, ownerId))
        ).map(mapCategoryRow);

    const target = existingOwnerCategories.find((c) => c.id === categoryId);
    if (!target) {
      throw new CategoryValidationError('Category not found.');
    }

    const duplicateSibling = existingOwnerCategories.find(
      (c) =>
        c.id !== categoryId &&
        (c.parentCategoryId ?? null) === (target.parentCategoryId ?? null) &&
        c.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicateSibling) {
      throw new CategoryValidationError(
        `Another category named "${cleanName}" already exists at this level.`
      );
    }

    if (!process.env.SQL_HOST) {
      const updated = fallbackRenameCategory(ownerId, categoryId, cleanName);
      if (!updated) {
        throw new CategoryValidationError('Category not found.');
      }
      return updated;
    }

    const [updatedRow] = await db
      .update(categories)
      .set({
        name: cleanName,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, categoryId), eq(categories.ownerId, ownerId)))
      .returning();

    if (!updatedRow) {
      throw new CategoryValidationError('Category not found.');
    }

    return mapCategoryRow(updatedRow);
  } catch (error) {
    if (error instanceof CategoryValidationError) {
      throw error;
    }
    console.error('Database update failed in renameCategoryForOwner:', error);
    throw new Error('Failed to rename category in database.', { cause: error });
  }
}

export async function deleteCategoryForOwner(
  ownerId: string,
  categoryId: string
): Promise<void> {
  try {
    if (!process.env.SQL_HOST) {
      const ok = fallbackDeleteCategory(ownerId, categoryId);
      if (!ok) {
        throw new CategoryValidationError('Category not found.');
      }
      return;
    }

    const existing = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.ownerId, ownerId)));

    if (existing.length === 0) {
      throw new CategoryValidationError('Category not found.');
    }

    const childCategories = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.ownerId, ownerId),
          eq(categories.parentCategoryId, categoryId)
        )
      );

    const affectedIds = [categoryId, ...childCategories.map((c) => c.id)];

    await db.transaction(async (tx) => {
      for (const id of affectedIds) {
        await tx
          .update(bookmarks)
          .set({
            primaryCategoryId: null,
            categorySource: 'uncategorized',
            categoryLocked: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookmarks.ownerId, ownerId),
              eq(bookmarks.primaryCategoryId, id)
            )
          );
      }

      await tx
        .delete(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.ownerId, ownerId)));
    });
  } catch (error) {
    if (error instanceof CategoryValidationError) {
      throw error;
    }
    console.error('Database delete failed in deleteCategoryForOwner:', error);
    throw new Error('Failed to delete category from database.', { cause: error });
  }
}
