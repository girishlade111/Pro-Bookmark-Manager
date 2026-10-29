import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  bookmarkPlacements,
  bookmarkTags,
  bookmarks,
  categories,
  classificationDecisions,
  classificationReviewQueue,
  classificationRules,
  importOccurrences,
  tags,
} from '../../db/schema.ts';
import {
  fallbackCreateCategory,
  fallbackCreateClassificationRule,
  fallbackDeleteClassificationRule,
  fallbackGetCategories,
  fallbackHydrateBookmarks,
  fallbackListClassificationRules,
  fallbackListReviewQueue,
  fallbackRecordClassificationDecision,
  fallbackResolveReviewQueueItem,
  fallbackSyncBookmarkTags,
  fallbackUpdateBookmark,
  fallbackUpdateClassificationRule,
  fallbackUpsertReviewQueueItem,
} from '../../db/server-store.ts';
import type {
  BookmarkRecord,
  CategoryRecord,
  ClassificationOverviewStats,
  ClassificationResult,
  ClassificationRuleRecord,
  ClassificationRuleType,
  ReviewQueueItemRecord,
} from '../../types/bookmark.ts';
import {
  classifyBookmarkDeterministic,
  RULESET_VERSION,
} from './engine.ts';
import { INITIAL_TAXONOMY_18_83 } from './taxonomy.ts';

export class ClassificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassificationValidationError';
  }
}

declare global {
  var _taxonomySeededOwners: Set<string> | undefined;
}

function getTaxonomySeededSet(): Set<string> {
  if (!global._taxonomySeededOwners) {
    global._taxonomySeededOwners = new Set<string>();
  }
  return global._taxonomySeededOwners;
}

function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
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

function mapRuleRow(
  row: typeof classificationRules.$inferSelect,
  catMap: Map<string, CategoryRecord>
): ClassificationRuleRecord {
  const mainCat = catMap.get(row.targetCategoryId) ?? null;
  const subCat = row.targetSubcategoryId
    ? catMap.get(row.targetSubcategoryId) ?? null
    : null;
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    ruleType: row.ruleType as ClassificationRuleType,
    pattern: row.pattern,
    targetCategoryId: row.targetCategoryId,
    targetCategoryName: mainCat ? mainCat.name : null,
    targetSubcategoryId: row.targetSubcategoryId ?? null,
    targetSubcategoryName: subCat ? subCat.name : null,
    priority: row.priority,
    confidenceScore: Number(row.confidenceScore ?? 0.94),
    isEnabled: row.isEnabled,
    source: (row.source as 'owner' | 'system_seed') || 'owner',
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Idempotently seeds the 18 initial main categories and 83 initial named subcategories
 * for the authenticated owner without duplicating existing categories or deleting custom ones.
 */
export async function ensureInitialTaxonomyForOwner(
  ownerId: string
): Promise<void> {
  const seededSet = getTaxonomySeededSet();
  if (seededSet.has(ownerId)) {
    return;
  }

  if (!process.env.SQL_HOST) {
    const existing = fallbackGetCategories(ownerId);
    const mainByLower = new Map<string, CategoryRecord>();
    const subByParentAndLower = new Map<string, CategoryRecord>();

    for (const c of existing) {
      if (!c.parentCategoryId) {
        mainByLower.set(c.name.trim().toLowerCase(), c);
      } else {
        subByParentAndLower.set(
          `${c.parentCategoryId}::${c.name.trim().toLowerCase()}`,
          c
        );
      }
    }

    for (const mainDef of INITIAL_TAXONOMY_18_83) {
      const mainKey = mainDef.name.trim().toLowerCase();
      let mainCat = mainByLower.get(mainKey);
      if (!mainCat) {
        mainCat = fallbackCreateCategory(ownerId, {
          name: mainDef.name,
          parentCategoryId: null,
          sortOrder: mainDef.sortOrder,
        });
        mainByLower.set(mainKey, mainCat);
      }

      for (let i = 0; i < mainDef.subcategories.length; i++) {
        const subName = mainDef.subcategories[i];
        const subKey = `${mainCat.id}::${subName.trim().toLowerCase()}`;
        if (!subByParentAndLower.has(subKey)) {
          const createdSub = fallbackCreateCategory(ownerId, {
            name: subName,
            parentCategoryId: mainCat.id,
            sortOrder: mainDef.sortOrder + i + 1,
          });
          subByParentAndLower.set(subKey, createdSub);
        }
      }
    }

    seededSet.add(ownerId);
    return;
  }

  try {
    const existingRows = await db
      .select()
      .from(categories)
      .where(eq(categories.ownerId, ownerId));

    const mainByLower = new Map<string, typeof categories.$inferSelect>();
    const subByParentAndLower = new Map<string, typeof categories.$inferSelect>();

    for (const row of existingRows) {
      if (!row.parentCategoryId) {
        mainByLower.set(row.name.trim().toLowerCase(), row);
      } else {
        subByParentAndLower.set(
          `${row.parentCategoryId}::${row.name.trim().toLowerCase()}`,
          row
        );
      }
    }

    for (const mainDef of INITIAL_TAXONOMY_18_83) {
      const mainKey = mainDef.name.trim().toLowerCase();
      if (!mainByLower.has(mainKey)) {
        const [insertedMain] = await db
          .insert(categories)
          .values({
            ownerId,
            name: mainDef.name,
            parentCategoryId: null,
            sortOrder: mainDef.sortOrder,
          })
          .returning();
        mainByLower.set(mainKey, insertedMain);
      }
    }

    const subsToInsert: (typeof categories.$inferInsert)[] = [];
    for (const mainDef of INITIAL_TAXONOMY_18_83) {
      const mainRow = mainByLower.get(mainDef.name.trim().toLowerCase());
      if (!mainRow) continue;

      for (let i = 0; i < mainDef.subcategories.length; i++) {
        const subName = mainDef.subcategories[i];
        const subKey = `${mainRow.id}::${subName.trim().toLowerCase()}`;
        if (!subByParentAndLower.has(subKey)) {
          subsToInsert.push({
            ownerId,
            name: subName,
            parentCategoryId: mainRow.id,
            sortOrder: mainDef.sortOrder + i + 1,
          });
        }
      }
    }

    if (subsToInsert.length > 0) {
      await db.insert(categories).values(subsToInsert);
    }

    seededSet.add(ownerId);
  } catch (error) {
    console.error('Failed to ensure 18/83 taxonomy seed:', error);
  }
}

export async function syncBookmarkTagsForOwner(
  ownerId: string,
  bookmarkId: string,
  tagNames: string[],
  source: 'manual' | 'auto_rule' = 'manual'
): Promise<void> {
  const cleanedNames = Array.from(
    new Set(
      tagNames
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 50)
    )
  );

  if (!process.env.SQL_HOST) {
    fallbackSyncBookmarkTags(ownerId, bookmarkId, cleanedNames, source);
    return;
  }

  try {
    if (source === 'manual') {
      await db
        .delete(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.ownerId, ownerId),
            eq(bookmarkTags.bookmarkId, bookmarkId)
          )
        );
    }

    if (cleanedNames.length === 0) {
      return;
    }

    const existingOwnerTags = await db
      .select()
      .from(tags)
      .where(eq(tags.ownerId, ownerId));

    const tagByNorm = new Map(
      existingOwnerTags.map((t) => [t.normalizedName, t])
    );

    const existingLinks = await db
      .select()
      .from(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.ownerId, ownerId),
          eq(bookmarkTags.bookmarkId, bookmarkId)
        )
      );
    const linkedTagIds = new Set(existingLinks.map((l) => l.tagId));

    for (const rawName of cleanedNames) {
      const norm = normalizeTagName(rawName);
      if (!norm) continue;

      let tagRow = tagByNorm.get(norm);
      if (!tagRow) {
        const [insertedTag] = await db
          .insert(tags)
          .values({
            ownerId,
            name: rawName,
            normalizedName: norm,
          })
          .returning();
        tagRow = insertedTag;
        tagByNorm.set(norm, insertedTag);
      }

      if (!linkedTagIds.has(tagRow.id)) {
        await db.insert(bookmarkTags).values({
          ownerId,
          bookmarkId,
          tagId: tagRow.id,
          source,
        });
        linkedTagIds.add(tagRow.id);
      }
    }
  } catch (error) {
    console.error('Failed to sync bookmark tags:', error);
  }
}

export async function recordManualClassificationForOwner(
  ownerId: string,
  bookmarkId: string,
  categoryId: string | null,
  explanation = 'Explicitly selected by the owner (manual lock active).'
): Promise<void> {
  if (!process.env.SQL_HOST) {
    const cats = fallbackGetCategories(ownerId);
    const catMap = new Map(cats.map((c) => [c.id, c]));
    const selected = categoryId ? catMap.get(categoryId) ?? null : null;
    const mainId = selected
      ? selected.parentCategoryId
        ? selected.parentCategoryId
        : selected.id
      : null;
    const subId = selected && selected.parentCategoryId ? selected.id : null;

    fallbackRecordClassificationDecision(ownerId, {
      bookmarkId,
      categoryId: mainId,
      subcategoryId: subId,
      classificationMethod: 'manual',
      confidence: 1.0,
      matchedRuleIds: categoryId ? ['manual_owner_selection'] : [],
      evidence: [explanation],
      rulesetVersion: RULESET_VERSION,
      requiresReview: false,
    });
    fallbackResolveReviewQueueItem(
      ownerId,
      bookmarkId,
      categoryId ? 'corrected' : 'kept_uncategorized'
    );
    return;
  }

  try {
    const catRows = await db
      .select()
      .from(categories)
      .where(eq(categories.ownerId, ownerId));
    const catMap = new Map(catRows.map((c) => [c.id, c]));
    const selected = categoryId ? catMap.get(categoryId) ?? null : null;
    const mainCategoryId = selected
      ? selected.parentCategoryId
        ? selected.parentCategoryId
        : selected.id
      : null;
    const subcategoryId =
      selected && selected.parentCategoryId ? selected.id : null;

    await db.insert(classificationDecisions).values({
      ownerId,
      bookmarkId,
      categoryId: mainCategoryId,
      subcategoryId,
      classificationMethod: 'manual',
      confidence: '1.00',
      matchedRuleIdsJson: JSON.stringify(
        categoryId ? ['manual_owner_selection'] : []
      ),
      evidenceJson: JSON.stringify([explanation]),
      rulesetVersion: RULESET_VERSION,
      requiresReview: false,
    });

    await db
      .update(classificationReviewQueue)
      .set({
        status: categoryId ? 'corrected' : 'kept_uncategorized',
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(classificationReviewQueue.ownerId, ownerId),
          eq(classificationReviewQueue.bookmarkId, bookmarkId)
        )
      );
  } catch (error) {
    console.error('Failed to record manual classification decision:', error);
  }
}

async function loadClassificationContextForOwner(ownerId: string): Promise<{
  categoriesList: CategoryRecord[];
  catMap: Map<string, CategoryRecord>;
  ownerRules: ClassificationRuleRecord[];
  folderPathsByBookmarkId: Map<string, string[][]>;
}> {
  await ensureInitialTaxonomyForOwner(ownerId);

  if (!process.env.SQL_HOST) {
    const categoriesList = fallbackGetCategories(ownerId);
    const catMap = new Map(categoriesList.map((c) => [c.id, c]));
    const ownerRules = fallbackListClassificationRules(ownerId);
    const hydrated = fallbackHydrateBookmarks(ownerId);
    const folderPathsByBookmarkId = new Map<string, string[][]>();
    for (const bm of hydrated) {
      if (bm.sourceFolderPaths && bm.sourceFolderPaths.length > 0) {
        folderPathsByBookmarkId.set(bm.id, bm.sourceFolderPaths);
      }
    }
    return { categoriesList, catMap, ownerRules, folderPathsByBookmarkId };
  }

  const [catRows, ruleRows, occRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.ownerId, ownerId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select()
      .from(classificationRules)
      .where(eq(classificationRules.ownerId, ownerId))
      .orderBy(desc(classificationRules.priority), desc(classificationRules.createdAt)),
    db
      .select({
        canonicalBookmarkId: importOccurrences.canonicalBookmarkId,
        folderPathJson: importOccurrences.folderPathJson,
      })
      .from(importOccurrences)
      .where(eq(importOccurrences.ownerId, ownerId)),
  ]);

  const categoriesList = catRows.map(mapCategoryRow);
  const catMap = new Map(categoriesList.map((c) => [c.id, c]));
  const ownerRules = ruleRows.map((r) => mapRuleRow(r, catMap));

  const folderPathsByBookmarkId = new Map<string, string[][]>();
  for (const occ of occRows) {
    if (!occ.canonicalBookmarkId) continue;
    try {
      const parsed = JSON.parse(occ.folderPathJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const list = folderPathsByBookmarkId.get(occ.canonicalBookmarkId) ?? [];
        list.push(parsed.map((s) => String(s)));
        folderPathsByBookmarkId.set(occ.canonicalBookmarkId, list);
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return { categoriesList, catMap, ownerRules, folderPathsByBookmarkId };
}

/**
 * Automatically evaluates a batch of bookmark IDs (e.g., newly imported bookmarks when no explicit
 * destination category was chosen, or newly created uncategorized bookmarks).
 * High-confidence (>= 0.90) unambiguous classifications are applied automatically with
 * category_source = 'auto' and category_locked = false.
 * Medium/Low confidence items are routed to the Manual Review Queue.
 */
export async function autoClassifyBookmarksBatchForOwner(
  ownerId: string,
  bookmarkIds: string[]
): Promise<{
  autoClassifiedCount: number;
  suggestedForReviewCount: number;
  needsReviewCount: number;
}> {
  if (bookmarkIds.length === 0) {
    return {
      autoClassifiedCount: 0,
      suggestedForReviewCount: 0,
      needsReviewCount: 0,
    };
  }

  const { categoriesList, ownerRules, folderPathsByBookmarkId } =
    await loadClassificationContextForOwner(ownerId);

  let autoClassifiedCount = 0;
  let suggestedForReviewCount = 0;
  let needsReviewCount = 0;

  if (!process.env.SQL_HOST) {
    const allBms = fallbackHydrateBookmarks(ownerId);
    const idSet = new Set(bookmarkIds);
    const targetBms = allBms.filter((b) => idSet.has(b.id));

    for (const bm of targetBms) {
      if (bm.categoryLocked) continue;

      const folderPaths = folderPathsByBookmarkId.get(bm.id) ?? [];
      const result = classifyBookmarkDeterministic(
        {
          bookmarkId: bm.id,
          originalUrl: bm.originalUrl,
          normalizedUrlKey: bm.normalizedUrlKey,
          domain: bm.domain,
          title: bm.title,
          description: bm.description,
          currentCategoryId: bm.primaryCategoryId,
          currentCategoryLocked: bm.categoryLocked,
          sourceFolderPaths: folderPaths,
        },
        categoriesList,
        ownerRules
      );

      const effectiveCatId = result.subcategoryId ?? result.categoryId;

      if (result.status === 'auto_classified' && effectiveCatId) {
        fallbackUpdateBookmark(ownerId, bm.id, (curr) => ({
          ...curr,
          primaryCategoryId: effectiveCatId,
          categorySource: 'auto',
          categoryLocked: false,
        }));
        fallbackRecordClassificationDecision(ownerId, {
          bookmarkId: bm.id,
          categoryId: result.categoryId,
          subcategoryId: result.subcategoryId,
          classificationMethod: 'auto_classified',
          confidence: result.confidence,
          matchedRuleIds: result.matchedRuleIds,
          evidence: result.evidence,
          rulesetVersion: result.rulesetVersion,
          requiresReview: false,
        });
        fallbackResolveReviewQueueItem(ownerId, bm.id, 'accepted');
        if (result.suggestedTags.length > 0) {
          fallbackSyncBookmarkTags(
            ownerId,
            bm.id,
            result.suggestedTags,
            'auto_rule'
          );
        }
        autoClassifiedCount += 1;
      } else {
        fallbackRecordClassificationDecision(ownerId, {
          bookmarkId: bm.id,
          categoryId: result.categoryId,
          subcategoryId: result.subcategoryId,
          classificationMethod:
            result.status === 'suggested' ? 'suggested' : 'needs_review',
          confidence: result.confidence,
          matchedRuleIds: result.matchedRuleIds,
          evidence: result.evidence,
          rulesetVersion: result.rulesetVersion,
          requiresReview: true,
        });
        fallbackUpsertReviewQueueItem(ownerId, {
          bookmarkId: bm.id,
          suggestedCategoryId: result.categoryId,
          suggestedSubcategoryId: result.subcategoryId,
          confidence: result.confidence,
          reviewReason:
            result.reviewReason ||
            (result.status === 'suggested'
              ? 'Moderate confidence suggestion requires owner confirmation.'
              : 'Low confidence or ambiguous signals.'),
          evidence: result.evidence,
          sourceFolderPath: folderPaths[0] ?? [],
        });
        if (result.status === 'suggested') {
          suggestedForReviewCount += 1;
        } else {
          needsReviewCount += 1;
        }
      }
    }

    return {
      autoClassifiedCount,
      suggestedForReviewCount,
      needsReviewCount,
    };
  }

  const bmRows = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.ownerId, ownerId),
        inArray(bookmarks.id, bookmarkIds)
      )
    );

  for (const bm of bmRows) {
    if (bm.categoryLocked) {
      continue;
    }

    const folderPaths = folderPathsByBookmarkId.get(bm.id) ?? [];
    const result = classifyBookmarkDeterministic(
      {
        bookmarkId: bm.id,
        originalUrl: bm.originalUrl,
        normalizedUrlKey: bm.normalizedUrlKey,
        domain: bm.domain,
        title: bm.title,
        description: bm.description,
        currentCategoryId: bm.primaryCategoryId,
        currentCategoryLocked: bm.categoryLocked,
        sourceFolderPaths: folderPaths,
      },
      categoriesList,
      ownerRules
    );

    const effectiveCatId = result.subcategoryId ?? result.categoryId;

    if (result.status === 'auto_classified' && effectiveCatId) {
      await db.transaction(async (tx) => {
        await tx
          .update(bookmarks)
          .set({
            primaryCategoryId: effectiveCatId,
            categorySource: 'auto',
            categoryLocked: false,
            updatedAt: new Date(),
          })
          .where(and(eq(bookmarks.id, bm.id), eq(bookmarks.ownerId, ownerId)));

        await tx
          .delete(bookmarkPlacements)
          .where(
            and(
              eq(bookmarkPlacements.bookmarkId, bm.id),
              eq(bookmarkPlacements.isPrimary, true)
            )
          );

        await tx
          .insert(bookmarkPlacements)
          .values({
            ownerId,
            bookmarkId: bm.id,
            categoryId: effectiveCatId,
            isPrimary: true,
            assignmentSource: 'auto',
            isLocked: false,
          })
          .onConflictDoUpdate({
            target: [
              bookmarkPlacements.bookmarkId,
              bookmarkPlacements.categoryId,
            ],
            set: {
              isPrimary: true,
              assignmentSource: 'auto',
              isLocked: false,
              updatedAt: new Date(),
            },
          });

        await tx.insert(classificationDecisions).values({
          ownerId,
          bookmarkId: bm.id,
          categoryId: result.categoryId,
          subcategoryId: result.subcategoryId,
          classificationMethod: 'auto_classified',
          confidence: result.confidence.toFixed(2),
          matchedRuleIdsJson: JSON.stringify(result.matchedRuleIds),
          evidenceJson: JSON.stringify(result.evidence),
          rulesetVersion: result.rulesetVersion,
          requiresReview: false,
        });

        await tx
          .update(classificationReviewQueue)
          .set({
            status: 'accepted',
            resolvedAt: new Date(),
          })
          .where(
            and(
              eq(classificationReviewQueue.ownerId, ownerId),
              eq(classificationReviewQueue.bookmarkId, bm.id)
            )
          );
      });

      if (result.suggestedTags.length > 0) {
        await syncBookmarkTagsForOwner(
          ownerId,
          bm.id,
          result.suggestedTags,
          'auto_rule'
        );
      }

      autoClassifiedCount += 1;
    } else {
      await db.insert(classificationDecisions).values({
        ownerId,
        bookmarkId: bm.id,
        categoryId: result.categoryId,
        subcategoryId: result.subcategoryId,
        classificationMethod:
          result.status === 'suggested' ? 'suggested' : 'needs_review',
        confidence: result.confidence.toFixed(2),
        matchedRuleIdsJson: JSON.stringify(result.matchedRuleIds),
        evidenceJson: JSON.stringify(result.evidence),
        rulesetVersion: result.rulesetVersion,
        requiresReview: true,
      });

      await db
        .delete(classificationReviewQueue)
        .where(
          and(
            eq(classificationReviewQueue.ownerId, ownerId),
            eq(classificationReviewQueue.bookmarkId, bm.id)
          )
        );

      await db.insert(classificationReviewQueue).values({
        ownerId,
        bookmarkId: bm.id,
        suggestedCategoryId: result.categoryId,
        suggestedSubcategoryId: result.subcategoryId,
        confidence: result.confidence.toFixed(2),
        reviewReason:
          result.reviewReason ||
          (result.status === 'suggested'
            ? 'Moderate confidence suggestion requires owner confirmation.'
            : 'Low confidence or ambiguous signals.'),
        evidenceJson: JSON.stringify(result.evidence),
        sourceFolderPathJson: JSON.stringify(folderPaths[0] ?? []),
        status: 'pending',
      });

      if (result.status === 'suggested') {
        suggestedForReviewCount += 1;
      } else {
        needsReviewCount += 1;
      }
    }
  }

  return {
    autoClassifiedCount,
    suggestedForReviewCount,
    needsReviewCount,
  };
}

export interface BatchClassificationPreviewItem {
  bookmarkId: string;
  title: string;
  originalUrl: string;
  domain: string;
  currentCategoryLabel: string | null;
  categoryLocked: boolean;
  sourceFolderPaths: string[][];
  result: ClassificationResult;
}

export interface BatchClassificationPreviewSummary {
  totalEvaluated: number;
  skippedManualLocksCount: number;
  highConfidenceAutoCount: number;
  mediumConfidenceSuggestedCount: number;
  lowConfidenceNeedsReviewCount: number;
  items: BatchClassificationPreviewItem[];
}

export async function previewClassifyUncategorizedForOwner(
  ownerId: string,
  options?: {
    includeAutoCategorized?: boolean;
  }
): Promise<BatchClassificationPreviewSummary> {
  const { categoriesList, catMap, ownerRules, folderPathsByBookmarkId } =
    await loadClassificationContextForOwner(ownerId);

  const includeAuto = Boolean(options?.includeAutoCategorized);

  let allBookmarks: {
    id: string;
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    primaryCategoryId: string | null;
    categorySource: BookmarkRecord['categorySource'];
    categoryLocked: boolean;
  }[] = [];

  if (!process.env.SQL_HOST) {
    allBookmarks = fallbackHydrateBookmarks(ownerId);
  } else {
    const rows = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.ownerId, ownerId))
      .orderBy(desc(bookmarks.createdAt));
    allBookmarks = rows.map((r) => ({
      id: r.id,
      originalUrl: r.originalUrl,
      normalizedUrlKey: r.normalizedUrlKey,
      domain: r.domain,
      title: r.title,
      description: r.description ?? null,
      notes: r.notes ?? null,
      primaryCategoryId: r.primaryCategoryId ?? null,
      categorySource:
        (r.categorySource as BookmarkRecord['categorySource']) ||
        'uncategorized',
      categoryLocked: r.categoryLocked,
    }));
  }

  let skippedManualLocksCount = 0;
  let highConfidenceAutoCount = 0;
  let mediumConfidenceSuggestedCount = 0;
  let lowConfidenceNeedsReviewCount = 0;
  const items: BatchClassificationPreviewItem[] = [];

  for (const bm of allBookmarks) {
    if (bm.categoryLocked) {
      skippedManualLocksCount += 1;
      continue;
    }

    if (!includeAuto && bm.primaryCategoryId !== null) {
      continue;
    }

    const folderPaths = folderPathsByBookmarkId.get(bm.id) ?? [];
    const result = classifyBookmarkDeterministic(
      {
        bookmarkId: bm.id,
        originalUrl: bm.originalUrl,
        normalizedUrlKey: bm.normalizedUrlKey,
        domain: bm.domain,
        title: bm.title,
        description: bm.description,
        currentCategoryId: bm.primaryCategoryId,
        currentCategoryLocked: bm.categoryLocked,
        sourceFolderPaths: folderPaths,
      },
      categoriesList,
      ownerRules
    );

    if (result.status === 'auto_classified') {
      highConfidenceAutoCount += 1;
    } else if (result.status === 'suggested') {
      mediumConfidenceSuggestedCount += 1;
    } else {
      lowConfidenceNeedsReviewCount += 1;
    }

    let currentCategoryLabel: string | null = null;
    if (bm.primaryCategoryId) {
      const cat = catMap.get(bm.primaryCategoryId);
      if (cat) {
        const parent = cat.parentCategoryId
          ? catMap.get(cat.parentCategoryId)
          : null;
        currentCategoryLabel = parent ? `${parent.name} / ${cat.name}` : cat.name;
      }
    }

    items.push({
      bookmarkId: bm.id,
      title: bm.title,
      originalUrl: bm.originalUrl,
      domain: bm.domain,
      currentCategoryLabel,
      categoryLocked: bm.categoryLocked,
      sourceFolderPaths: folderPaths,
      result,
    });
  }

  return {
    totalEvaluated: items.length,
    skippedManualLocksCount,
    highConfidenceAutoCount,
    mediumConfidenceSuggestedCount,
    lowConfidenceNeedsReviewCount,
    items,
  };
}

export async function applyClassifyUncategorizedForOwner(
  ownerId: string,
  options?: {
    includeAutoCategorized?: boolean;
    bookmarkIds?: string[];
  }
): Promise<{
  evaluatedCount: number;
  autoClassifiedCount: number;
  suggestedForReviewCount: number;
  needsReviewCount: number;
  skippedManualLocksCount: number;
}> {
  const preview = await previewClassifyUncategorizedForOwner(ownerId, {
    includeAutoCategorized: options?.includeAutoCategorized,
  });

  const targetIds =
    options?.bookmarkIds && options.bookmarkIds.length > 0
      ? preview.items
          .filter((i) => options.bookmarkIds!.includes(i.bookmarkId))
          .map((i) => i.bookmarkId)
      : preview.items.map((i) => i.bookmarkId);

  const outcome = await autoClassifyBookmarksBatchForOwner(ownerId, targetIds);

  return {
    evaluatedCount: targetIds.length,
    autoClassifiedCount: outcome.autoClassifiedCount,
    suggestedForReviewCount: outcome.suggestedForReviewCount,
    needsReviewCount: outcome.needsReviewCount,
    skippedManualLocksCount: preview.skippedManualLocksCount,
  };
}

export async function getClassificationOverviewForOwner(
  ownerId: string
): Promise<ClassificationOverviewStats> {
  await ensureInitialTaxonomyForOwner(ownerId);

  if (!process.env.SQL_HOST) {
    const bms = fallbackHydrateBookmarks(ownerId);
    const cats = fallbackGetCategories(ownerId);
    const rules = fallbackListClassificationRules(ownerId);
    const queue = fallbackListReviewQueue(ownerId, 'pending');

    const mainCategoriesCount = cats.filter((c) => !c.parentCategoryId).length;
    const subcategoriesCount = cats.filter((c) => Boolean(c.parentCategoryId)).length;

    return {
      pendingReviewCount: queue.length,
      autoClassifiedCount: bms.filter((b) => b.categorySource === 'auto').length,
      manuallyCategorizedCount: bms.filter((b) => b.categoryLocked).length,
      uncategorizedCount: bms.filter((b) => !b.primaryCategoryId).length,
      totalRulesCount: rules.length,
      ownerRulesCount: rules.filter((r) => r.source === 'owner').length,
      mainCategoriesCount,
      subcategoriesCount,
    };
  }

  const [bmRows, catRows, ruleRows, queueRows] = await Promise.all([
    db
      .select({
        id: bookmarks.id,
        primaryCategoryId: bookmarks.primaryCategoryId,
        categorySource: bookmarks.categorySource,
        categoryLocked: bookmarks.categoryLocked,
      })
      .from(bookmarks)
      .where(eq(bookmarks.ownerId, ownerId)),
    db
      .select({
        id: categories.id,
        parentCategoryId: categories.parentCategoryId,
      })
      .from(categories)
      .where(eq(categories.ownerId, ownerId)),
    db
      .select({
        id: classificationRules.id,
        source: classificationRules.source,
      })
      .from(classificationRules)
      .where(eq(classificationRules.ownerId, ownerId)),
    db
      .select({
        id: classificationReviewQueue.id,
      })
      .from(classificationReviewQueue)
      .where(
        and(
          eq(classificationReviewQueue.ownerId, ownerId),
          eq(classificationReviewQueue.status, 'pending')
        )
      ),
  ]);

  const mainCategoriesCount = catRows.filter((c) => !c.parentCategoryId).length;
  const subcategoriesCount = catRows.filter((c) => Boolean(c.parentCategoryId)).length;

  return {
    pendingReviewCount: queueRows.length,
    autoClassifiedCount: bmRows.filter((b) => b.categorySource === 'auto').length,
    manuallyCategorizedCount: bmRows.filter((b) => b.categoryLocked).length,
    uncategorizedCount: bmRows.filter((b) => !b.primaryCategoryId).length,
    totalRulesCount: ruleRows.length,
    ownerRulesCount: ruleRows.filter((r) => r.source === 'owner').length,
    mainCategoriesCount,
    subcategoriesCount,
  };
}

export async function listReviewQueueForOwner(
  ownerId: string,
  statusFilter: 'pending' | 'resolved' | 'dismissed' | 'all' = 'pending'
): Promise<ReviewQueueItemRecord[]> {
  const { catMap, folderPathsByBookmarkId } =
    await loadClassificationContextForOwner(ownerId);

  if (!process.env.SQL_HOST) {
    if (statusFilter === 'resolved') {
      const all = fallbackListReviewQueue(ownerId, 'all');
      return all.filter(
        (r) =>
          r.status === 'accepted' ||
          r.status === 'corrected' ||
          r.status === 'kept_uncategorized'
      );
    }
    return fallbackListReviewQueue(ownerId, statusFilter);
  }

  const allQueueRows = await db
    .select()
    .from(classificationReviewQueue)
    .where(eq(classificationReviewQueue.ownerId, ownerId))
    .orderBy(desc(classificationReviewQueue.createdAt));

  const queueRows = allQueueRows.filter((row) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return row.status === 'pending';
    if (statusFilter === 'dismissed') return row.status === 'dismissed';
    if (statusFilter === 'resolved') {
      return (
        row.status === 'accepted' ||
        row.status === 'corrected' ||
        row.status === 'kept_uncategorized'
      );
    }
    return true;
  });

  if (queueRows.length === 0) {
    return [];
  }

  const bmIds = Array.from(new Set(queueRows.map((q) => q.bookmarkId)));
  const bmRows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.ownerId, ownerId), inArray(bookmarks.id, bmIds)));

  const bmMap = new Map(bmRows.map((b) => [b.id, b]));

  const items: ReviewQueueItemRecord[] = [];
  for (const row of queueRows) {
    const bm = bmMap.get(row.bookmarkId);
    if (!bm) continue;

    const currentCat = bm.primaryCategoryId
      ? catMap.get(bm.primaryCategoryId) ?? null
      : null;
    const suggestedMain = row.suggestedCategoryId
      ? catMap.get(row.suggestedCategoryId) ?? null
      : null;
    const suggestedSub = row.suggestedSubcategoryId
      ? catMap.get(row.suggestedSubcategoryId) ?? null
      : null;

    let evidence: string[] = [];
    try {
      const parsed = JSON.parse(row.evidenceJson);
      if (Array.isArray(parsed)) {
        evidence = parsed.map((s) => String(s));
      }
    } catch {
      evidence = [];
    }

    let sourceFolderPath: string[] = [];
    try {
      const parsed = JSON.parse(row.sourceFolderPathJson);
      if (Array.isArray(parsed)) {
        sourceFolderPath = parsed.map((s) => String(s));
      }
    } catch {
      sourceFolderPath = [];
    }
    if (sourceFolderPath.length === 0) {
      const fallbackPaths = folderPathsByBookmarkId.get(bm.id);
      if (fallbackPaths && fallbackPaths.length > 0) {
        sourceFolderPath = fallbackPaths[0];
      }
    }

    items.push({
      id: row.id,
      ownerId: row.ownerId,
      bookmarkId: row.bookmarkId,
      bookmarkTitle: bm.title,
      bookmarkUrl: bm.originalUrl,
      bookmarkDomain: bm.domain,
      existingCategoryId: bm.primaryCategoryId ?? null,
      existingCategoryLabel: currentCat ? currentCat.name : null,
      suggestedCategoryId: row.suggestedCategoryId ?? null,
      suggestedCategoryName: suggestedMain ? suggestedMain.name : null,
      suggestedSubcategoryId: row.suggestedSubcategoryId ?? null,
      suggestedSubcategoryName: suggestedSub ? suggestedSub.name : null,
      confidence: Number(row.confidence ?? 0),
      reviewReason: row.reviewReason,
      evidence,
      sourceFolderPath,
      status: row.status as ReviewQueueItemRecord['status'],
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    });
  }

  return items;
}

export interface ResolveReviewQueueInput {
  action:
    | 'accept_suggestion'
    | 'choose_category'
    | 'keep_uncategorized'
    | 'dismiss';
  categoryId?: string | null;
  createReusableRule?: {
    ruleType: ClassificationRuleType;
    pattern: string;
    name?: string;
    applyToMatchingUnlocked?: boolean;
  } | null;
}

export async function resolveReviewQueueItemForOwner(
  ownerId: string,
  bookmarkId: string,
  input: ResolveReviewQueueInput
): Promise<{
  resolvedBookmarkId: string;
  appliedCategoryId: string | null;
  createdRule: ClassificationRuleRecord | null;
  additionalMatchedUpdatedCount: number;
}> {
  const { catMap } = await loadClassificationContextForOwner(ownerId);

  let targetCategoryId: string | null = null;

  if (input.action === 'accept_suggestion') {
    if (!process.env.SQL_HOST) {
      const queue = fallbackListReviewQueue(ownerId, 'all');
      const item = queue.find((q) => q.bookmarkId === bookmarkId);
      targetCategoryId =
        item?.suggestedSubcategoryId ?? item?.suggestedCategoryId ?? null;
    } else {
      const qRows = await db
        .select()
        .from(classificationReviewQueue)
        .where(
          and(
            eq(classificationReviewQueue.ownerId, ownerId),
            eq(classificationReviewQueue.bookmarkId, bookmarkId)
          )
        )
        .limit(1);
      if (qRows.length > 0) {
        targetCategoryId =
          qRows[0].suggestedSubcategoryId ??
          qRows[0].suggestedCategoryId ??
          null;
      }
    }
    if (!targetCategoryId && input.categoryId) {
      targetCategoryId = input.categoryId;
    }
    if (!targetCategoryId || !catMap.has(targetCategoryId)) {
      throw new ClassificationValidationError(
        'Cannot accept suggestion because no valid suggested category is present. Please choose a category.'
      );
    }
  } else if (input.action === 'choose_category') {
    const rawCat = (input.categoryId || '').trim();
    if (!rawCat || !catMap.has(rawCat)) {
      throw new ClassificationValidationError(
        'Please select a valid category or subcategory.'
      );
    }
    targetCategoryId = rawCat;
  } else if (input.action === 'keep_uncategorized') {
    targetCategoryId = null;
  }

  if (!process.env.SQL_HOST) {
    if (
      input.action === 'accept_suggestion' ||
      input.action === 'choose_category'
    ) {
      fallbackUpdateBookmark(ownerId, bookmarkId, (curr) => ({
        ...curr,
        primaryCategoryId: targetCategoryId,
        categorySource: 'manual',
        categoryLocked: true,
      }));
      await recordManualClassificationForOwner(
        ownerId,
        bookmarkId,
        targetCategoryId,
        input.action === 'accept_suggestion'
          ? 'Owner accepted classification suggestion (manual lock applied).'
          : 'Owner manually selected category during review (manual lock applied).'
      );
    } else if (input.action === 'keep_uncategorized') {
      fallbackUpdateBookmark(ownerId, bookmarkId, (curr) => ({
        ...curr,
        primaryCategoryId: null,
        categorySource: 'uncategorized',
        categoryLocked: false,
      }));
      fallbackResolveReviewQueueItem(ownerId, bookmarkId, 'kept_uncategorized');
    } else {
      fallbackResolveReviewQueueItem(ownerId, bookmarkId, 'dismissed');
    }
  } else {
    if (
      input.action === 'accept_suggestion' ||
      input.action === 'choose_category'
    ) {
      await db.transaction(async (tx) => {
        await tx
          .update(bookmarks)
          .set({
            primaryCategoryId: targetCategoryId,
            categorySource: 'manual',
            categoryLocked: true,
            updatedAt: new Date(),
          })
          .where(
            and(eq(bookmarks.id, bookmarkId), eq(bookmarks.ownerId, ownerId))
          );

        await tx
          .delete(bookmarkPlacements)
          .where(
            and(
              eq(bookmarkPlacements.bookmarkId, bookmarkId),
              eq(bookmarkPlacements.isPrimary, true)
            )
          );

        if (targetCategoryId) {
          await tx
            .insert(bookmarkPlacements)
            .values({
              ownerId,
              bookmarkId,
              categoryId: targetCategoryId,
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
      });

      await recordManualClassificationForOwner(
        ownerId,
        bookmarkId,
        targetCategoryId,
        input.action === 'accept_suggestion'
          ? 'Owner accepted classification suggestion (manual lock applied).'
          : 'Owner manually selected category during review (manual lock applied).'
      );
    } else if (input.action === 'keep_uncategorized') {
      await db.transaction(async (tx) => {
        await tx
          .update(bookmarks)
          .set({
            primaryCategoryId: null,
            categorySource: 'uncategorized',
            categoryLocked: false,
            updatedAt: new Date(),
          })
          .where(
            and(eq(bookmarks.id, bookmarkId), eq(bookmarks.ownerId, ownerId))
          );

        await tx
          .delete(bookmarkPlacements)
          .where(
            and(
              eq(bookmarkPlacements.bookmarkId, bookmarkId),
              eq(bookmarkPlacements.isPrimary, true)
            )
          );

        await tx
          .update(classificationReviewQueue)
          .set({
            status: 'kept_uncategorized',
            resolvedAt: new Date(),
          })
          .where(
            and(
              eq(classificationReviewQueue.ownerId, ownerId),
              eq(classificationReviewQueue.bookmarkId, bookmarkId)
            )
          );
      });
    } else {
      await db
        .update(classificationReviewQueue)
        .set({
          status: 'dismissed',
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(classificationReviewQueue.ownerId, ownerId),
            eq(classificationReviewQueue.bookmarkId, bookmarkId)
          )
        );
    }
  }

  let createdRule: ClassificationRuleRecord | null = null;
  let additionalMatchedUpdatedCount = 0;

  if (input.createReusableRule && targetCategoryId) {
    createdRule = await createClassificationRuleForOwner(ownerId, {
      name:
        input.createReusableRule.name ||
        `Owner ${input.createReusableRule.ruleType} rule (${input.createReusableRule.pattern})`,
      ruleType: input.createReusableRule.ruleType,
      pattern: input.createReusableRule.pattern,
      categoryId: targetCategoryId,
    });

    if (input.createReusableRule.applyToMatchingUnlocked) {
      const applied = await applyClassifyUncategorizedForOwner(ownerId, {
        includeAutoCategorized: true,
      });
      additionalMatchedUpdatedCount = applied.autoClassifiedCount;
    }
  }

  return {
    resolvedBookmarkId: bookmarkId,
    appliedCategoryId: targetCategoryId,
    createdRule,
    additionalMatchedUpdatedCount,
  };
}

export async function listClassificationRulesForOwner(
  ownerId: string
): Promise<ClassificationRuleRecord[]> {
  const { ownerRules } = await loadClassificationContextForOwner(ownerId);
  return ownerRules;
}

export async function previewRuleImpactForOwner(
  ownerId: string,
  input: {
    ruleType: ClassificationRuleType;
    pattern: string;
    categoryId: string;
  }
): Promise<{
  matchingUnlockedCount: number;
  matchingLockedSkippedCount: number;
  sampleMatches: {
    id: string;
    title: string;
    originalUrl: string;
    domain: string;
    currentCategoryLabel: string | null;
  }[];
}> {
  const cleanPattern = (input.pattern || '').trim();
  if (!cleanPattern) {
    throw new ClassificationValidationError('Rule pattern cannot be empty.');
  }

  const { categoriesList, catMap, folderPathsByBookmarkId } =
    await loadClassificationContextForOwner(ownerId);

  const selectedCat = catMap.get(input.categoryId);
  if (!selectedCat) {
    throw new ClassificationValidationError('Selected category does not exist.');
  }

  const targetCategoryId = selectedCat.parentCategoryId
    ? selectedCat.parentCategoryId
    : selectedCat.id;
  const targetSubcategoryId = selectedCat.parentCategoryId
    ? selectedCat.id
    : null;

  const tempRule: ClassificationRuleRecord = {
    id: 'preview_temp_rule',
    ownerId,
    name: `Preview ${input.ruleType}`,
    ruleType: input.ruleType,
    pattern: cleanPattern,
    targetCategoryId,
    targetCategoryName: catMap.get(targetCategoryId)?.name ?? null,
    targetSubcategoryId,
    targetSubcategoryName: targetSubcategoryId
      ? catMap.get(targetSubcategoryId)?.name ?? null
      : null,
    priority: 150,
    confidenceScore: 0.96,
    isEnabled: true,
    source: 'owner',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let allBookmarks: {
    id: string;
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    primaryCategoryId: string | null;
    categorySource: BookmarkRecord['categorySource'];
    categoryLocked: boolean;
  }[] = [];

  if (!process.env.SQL_HOST) {
    allBookmarks = fallbackHydrateBookmarks(ownerId);
  } else {
    const rows = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.ownerId, ownerId));
    allBookmarks = rows.map((r) => ({
      id: r.id,
      originalUrl: r.originalUrl,
      normalizedUrlKey: r.normalizedUrlKey,
      domain: r.domain,
      title: r.title,
      description: r.description ?? null,
      notes: r.notes ?? null,
      primaryCategoryId: r.primaryCategoryId ?? null,
      categorySource:
        (r.categorySource as BookmarkRecord['categorySource']) ||
        'uncategorized',
      categoryLocked: r.categoryLocked,
    }));
  }

  let matchingUnlockedCount = 0;
  let matchingLockedSkippedCount = 0;
  const sampleMatches: {
    id: string;
    title: string;
    originalUrl: string;
    domain: string;
    currentCategoryLabel: string | null;
  }[] = [];

  for (const bm of allBookmarks) {
    const folderPaths = folderPathsByBookmarkId.get(bm.id) ?? [];
    const evalResult = classifyBookmarkDeterministic(
      {
        bookmarkId: bm.id,
        originalUrl: bm.originalUrl,
        normalizedUrlKey: bm.normalizedUrlKey,
        domain: bm.domain,
        title: bm.title,
        description: bm.description,
        currentCategoryId: bm.primaryCategoryId,
        currentCategoryLocked: false,
        sourceFolderPaths: folderPaths,
      },
      categoriesList,
      [tempRule]
    );

    if (evalResult.matchedRuleIds.includes('preview_temp_rule')) {
      if (bm.categoryLocked) {
        matchingLockedSkippedCount += 1;
      } else {
        matchingUnlockedCount += 1;
        if (sampleMatches.length < 10) {
          const cat = bm.primaryCategoryId
            ? catMap.get(bm.primaryCategoryId)
            : null;
          sampleMatches.push({
            id: bm.id,
            title: bm.title,
            originalUrl: bm.originalUrl,
            domain: bm.domain,
            currentCategoryLabel: cat ? cat.name : null,
          });
        }
      }
    }
  }

  return {
    matchingUnlockedCount,
    matchingLockedSkippedCount,
    sampleMatches,
  };
}

export async function createClassificationRuleForOwner(
  ownerId: string,
  input: {
    name?: string;
    ruleType: ClassificationRuleType;
    pattern: string;
    categoryId?: string | null;
    targetCategoryId?: string | null;
    targetSubcategoryId?: string | null;
    priority?: number;
    confidence?: number;
  }
): Promise<ClassificationRuleRecord> {
  const cleanPattern = (input.pattern || '').trim();
  if (!cleanPattern) {
    throw new ClassificationValidationError('Rule pattern is required.');
  }

  const allowedTypes: ClassificationRuleType[] = [
    'exact_url',
    'path_prefix',
    'hostname',
    'subdomain',
    'folder_mapping',
    'title_keyword',
  ];
  if (!allowedTypes.includes(input.ruleType)) {
    throw new ClassificationValidationError(
      `Unsupported rule type: "${input.ruleType}".`
    );
  }

  const { catMap } = await loadClassificationContextForOwner(ownerId);

  let targetCategoryId = input.targetCategoryId ?? null;
  let targetSubcategoryId = input.targetSubcategoryId ?? null;

  if (input.categoryId && catMap.has(input.categoryId)) {
    const selected = catMap.get(input.categoryId)!;
    if (selected.parentCategoryId) {
      targetCategoryId = selected.parentCategoryId;
      targetSubcategoryId = selected.id;
    } else {
      targetCategoryId = selected.id;
      targetSubcategoryId = null;
    }
  }

  if (!targetCategoryId || !catMap.has(targetCategoryId)) {
    throw new ClassificationValidationError(
      'Please choose a valid destination category for this rule.'
    );
  }

  const defaultPriorityByScope: Record<ClassificationRuleType, number> = {
    exact_url: 120,
    path_prefix: 110,
    folder_mapping: 105,
    subdomain: 100,
    hostname: 95,
    title_keyword: 85,
  };

  const defaultConfidenceByScope: Record<ClassificationRuleType, number> = {
    exact_url: 0.99,
    path_prefix: 0.96,
    folder_mapping: 0.95,
    subdomain: 0.94,
    hostname: 0.94,
    title_keyword: 0.91,
  };

  const cleanName =
    input.name && input.name.trim().length > 0
      ? input.name.trim()
      : `${input.ruleType}: ${cleanPattern}`;
  const priority =
    typeof input.priority === 'number'
      ? input.priority
      : defaultPriorityByScope[input.ruleType] ?? 100;
  const confidenceScore =
    typeof input.confidence === 'number'
      ? Math.max(0.5, Math.min(1.0, input.confidence))
      : defaultConfidenceByScope[input.ruleType] ?? 0.94;

  if (!process.env.SQL_HOST) {
    return fallbackCreateClassificationRule(ownerId, {
      name: cleanName,
      ruleType: input.ruleType,
      pattern: cleanPattern,
      targetCategoryId,
      targetSubcategoryId,
      priority,
      confidenceScore,
      isEnabled: true,
      source: 'owner',
    });
  }

  const [inserted] = await db
    .insert(classificationRules)
    .values({
      ownerId,
      name: cleanName,
      ruleType: input.ruleType,
      pattern: cleanPattern,
      targetCategoryId,
      targetSubcategoryId,
      priority,
      confidenceScore: confidenceScore.toFixed(2),
      isEnabled: true,
      source: 'owner',
      version: 1,
    })
    .returning();

  return mapRuleRow(inserted, catMap);
}

export async function updateClassificationRuleForOwner(
  ownerId: string,
  ruleId: string,
  patch: {
    name?: string;
    pattern?: string;
    categoryId?: string;
    priority?: number;
    enabled?: boolean;
  }
): Promise<ClassificationRuleRecord> {
  const { catMap } = await loadClassificationContextForOwner(ownerId);

  let targetCategoryId: string | undefined = undefined;
  let targetSubcategoryId: string | null | undefined = undefined;

  if (patch.categoryId !== undefined) {
    const selected = catMap.get(patch.categoryId);
    if (!selected) {
      throw new ClassificationValidationError('Selected category not found.');
    }
    if (selected.parentCategoryId) {
      targetCategoryId = selected.parentCategoryId;
      targetSubcategoryId = selected.id;
    } else {
      targetCategoryId = selected.id;
      targetSubcategoryId = null;
    }
  }

  if (!process.env.SQL_HOST) {
    const updated = fallbackUpdateClassificationRule(ownerId, ruleId, {
      name: patch.name?.trim(),
      pattern: patch.pattern?.trim(),
      targetCategoryId,
      targetSubcategoryId,
      priority: patch.priority,
      isEnabled: patch.enabled,
    });
    if (!updated) {
      throw new ClassificationValidationError('Classification rule not found.');
    }
    return updated;
  }

  const existing = await db
    .select()
    .from(classificationRules)
    .where(
      and(
        eq(classificationRules.id, ruleId),
        eq(classificationRules.ownerId, ownerId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    throw new ClassificationValidationError('Classification rule not found.');
  }

  const curr = existing[0];
  const [updated] = await db
    .update(classificationRules)
    .set({
      name:
        patch.name !== undefined && patch.name.trim().length > 0
          ? patch.name.trim()
          : curr.name,
      pattern:
        patch.pattern !== undefined && patch.pattern.trim().length > 0
          ? patch.pattern.trim()
          : curr.pattern,
      targetCategoryId:
        targetCategoryId !== undefined
          ? targetCategoryId
          : curr.targetCategoryId,
      targetSubcategoryId:
        targetSubcategoryId !== undefined
          ? targetSubcategoryId
          : curr.targetSubcategoryId,
      priority:
        patch.priority !== undefined ? patch.priority : curr.priority,
      isEnabled:
        patch.enabled !== undefined ? patch.enabled : curr.isEnabled,
      version: curr.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(classificationRules.id, ruleId),
        eq(classificationRules.ownerId, ownerId)
      )
    )
    .returning();

  return mapRuleRow(updated, catMap);
}

export async function deleteClassificationRuleForOwner(
  ownerId: string,
  ruleId: string
): Promise<void> {
  if (!process.env.SQL_HOST) {
    const ok = fallbackDeleteClassificationRule(ownerId, ruleId);
    if (!ok) {
      throw new ClassificationValidationError('Classification rule not found.');
    }
    return;
  }

  const deleted = await db
    .delete(classificationRules)
    .where(
      and(
        eq(classificationRules.id, ruleId),
        eq(classificationRules.ownerId, ownerId)
      )
    )
    .returning({ id: classificationRules.id });

  if (deleted.length === 0) {
    throw new ClassificationValidationError('Classification rule not found.');
  }
}
