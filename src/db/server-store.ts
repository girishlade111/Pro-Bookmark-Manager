import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BookmarkRecord,
  CategoryAssignmentSource,
  CategoryRecord,
  ClassificationRuleRecord,
  ClassificationRuleType,
  ImportConflictStrategy,
  ImportJobRecord,
  ImportOccurrenceRecord,
  ReviewQueueItemRecord,
  TagRecord,
} from '../types/bookmark.ts';

export interface StoredPlacement {
  id: string;
  ownerId: string;
  bookmarkId: string;
  categoryId: string;
  isPrimary: boolean;
  assignmentSource: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface StoredImportJob extends ImportJobRecord {
  previewTokenHash: string | null;
  idempotencyKey: string | null;
  stagedPayloadJson: string | null;
}

export interface StoredClassificationDecision {
  id: string;
  ownerId: string;
  bookmarkId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  classificationMethod: 'manual' | 'auto_classified' | 'suggested' | 'needs_review';
  confidence: number;
  matchedRuleIds: string[];
  evidence: string[];
  rulesetVersion: string;
  requiresReview: boolean;
  createdAt: string;
}

export interface StoredTag {
  id: string;
  ownerId: string;
  name: string;
  normalizedName: string;
  createdAt: string;
}

export interface StoredBookmarkTag {
  id: string;
  ownerId: string;
  bookmarkId: string;
  tagId: string;
  source: 'manual' | 'auto_rule';
  createdAt: string;
}

interface ServerStoreData {
  users: StoredUser[];
  categories: CategoryRecord[];
  bookmarks: Omit<
    BookmarkRecord,
    'primaryCategoryName' | 'parentCategoryId' | 'parentCategoryName'
  >[];
  bookmarkPlacements: StoredPlacement[];
  importJobs: StoredImportJob[];
  importOccurrences: ImportOccurrenceRecord[];
  classificationRules: ClassificationRuleRecord[];
  classificationDecisions: StoredClassificationDecision[];
  classificationReviewQueue: ReviewQueueItemRecord[];
  tags: StoredTag[];
  bookmarkTags: StoredBookmarkTag[];
  seededOwners: string[];
}

const STORE_FILE_PATH = path.join(process.cwd(), '.next', 'pvbm-server-store.json');

declare global {
  var _pvbmServerStore: ServerStoreData | undefined;
}

function ensureStoreArrays(store: ServerStoreData): ServerStoreData {
  if (!store.importJobs) store.importJobs = [];
  if (!store.importOccurrences) store.importOccurrences = [];
  if (!store.classificationRules) store.classificationRules = [];
  if (!store.classificationDecisions) store.classificationDecisions = [];
  if (!store.classificationReviewQueue) store.classificationReviewQueue = [];
  if (!store.tags) store.tags = [];
  if (!store.bookmarkTags) store.bookmarkTags = [];
  if (!store.seededOwners) store.seededOwners = [];
  return store;
}

function loadStore(): ServerStoreData {
  if (global._pvbmServerStore) {
    return ensureStoreArrays(global._pvbmServerStore);
  }

  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
      const parsed = ensureStoreArrays(JSON.parse(raw) as ServerStoreData);
      global._pvbmServerStore = parsed;
      return parsed;
    }
  } catch {
    // Ignore read error and initialize fresh store
  }

  const initial: ServerStoreData = {
    users: [],
    categories: [],
    bookmarks: [],
    bookmarkPlacements: [],
    importJobs: [],
    importOccurrences: [],
    classificationRules: [],
    classificationDecisions: [],
    classificationReviewQueue: [],
    tags: [],
    bookmarkTags: [],
    seededOwners: [],
  };
  global._pvbmServerStore = initial;
  return initial;
}

function persistStore(store: ServerStoreData): void {
  global._pvbmServerStore = store;
  try {
    const dir = path.dirname(STORE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore write errors in read-only environments
  }
}

export function fallbackUpsertUser(
  uid: string,
  email: string,
  displayName?: string | null
): StoredUser {
  const store = loadStore();
  const existing = store.users.find((u) => u.uid === uid);
  if (existing) {
    existing.email = email;
    existing.displayName = displayName ?? null;
    persistStore(store);
    return existing;
  }

  const created: StoredUser = {
    id: store.users.length + 1,
    uid,
    email,
    displayName: displayName ?? null,
    createdAt: new Date().toISOString(),
  };
  store.users.push(created);
  persistStore(store);
  return created;
}

export function fallbackGetCategories(ownerId: string): CategoryRecord[] {
  const store = loadStore();
  return store.categories
    .filter((c) => c.ownerId === ownerId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function fallbackCreateCategory(
  ownerId: string,
  input: {
    name: string;
    parentCategoryId: string | null;
    sortOrder?: number;
  }
): CategoryRecord {
  const store = loadStore();
  const now = new Date().toISOString();
  const ownerCats = store.categories.filter((c) => c.ownerId === ownerId);

  const created: CategoryRecord = {
    id: crypto.randomUUID(),
    ownerId,
    name: input.name,
    parentCategoryId: input.parentCategoryId,
    sortOrder: input.sortOrder ?? ownerCats.length,
    createdAt: now,
    updatedAt: now,
  };
  store.categories.push(created);
  persistStore(store);
  return created;
}

export function fallbackRenameCategory(
  ownerId: string,
  categoryId: string,
  newName: string
): CategoryRecord | null {
  const store = loadStore();
  const target = store.categories.find(
    (c) => c.id === categoryId && c.ownerId === ownerId
  );
  if (!target) return null;
  target.name = newName;
  target.updatedAt = new Date().toISOString();
  persistStore(store);
  return target;
}

export function fallbackDeleteCategory(
  ownerId: string,
  categoryId: string
): boolean {
  const store = loadStore();
  const target = store.categories.find(
    (c) => c.id === categoryId && c.ownerId === ownerId
  );
  if (!target) return false;

  const childIds = store.categories
    .filter((c) => c.ownerId === ownerId && c.parentCategoryId === categoryId)
    .map((c) => c.id);

  const affectedIds = new Set([categoryId, ...childIds]);
  const now = new Date().toISOString();

  for (const bm of store.bookmarks) {
    if (
      bm.ownerId === ownerId &&
      bm.primaryCategoryId &&
      affectedIds.has(bm.primaryCategoryId)
    ) {
      bm.primaryCategoryId = null;
      bm.categorySource = 'uncategorized';
      bm.categoryLocked = false;
      bm.updatedAt = now;
    }
  }

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => !(p.ownerId === ownerId && affectedIds.has(p.categoryId))
  );
  store.categories = store.categories.filter(
    (c) => !(c.ownerId === ownerId && affectedIds.has(c.id))
  );

  persistStore(store);
  return true;
}

export function fallbackHydrateBookmarks(ownerId: string): BookmarkRecord[] {
  const store = loadStore();
  const catMap = new Map(
    store.categories.filter((c) => c.ownerId === ownerId).map((c) => [c.id, c])
  );

  const tagMap = new Map(
    store.tags.filter((t) => t.ownerId === ownerId).map((t) => [t.id, t])
  );
  const bmTagsByBmId = new Map<string, TagRecord[]>();
  for (const bt of store.bookmarkTags) {
    if (bt.ownerId !== ownerId) continue;
    const t = tagMap.get(bt.tagId);
    if (!t) continue;
    const list = bmTagsByBmId.get(bt.bookmarkId) ?? [];
    list.push({
      id: t.id,
      name: t.name,
      normalizedName: t.normalizedName,
      source: bt.source,
    });
    bmTagsByBmId.set(bt.bookmarkId, list);
  }

  const latestDecisionByBmId = new Map<string, StoredClassificationDecision>();
  for (const dec of store.classificationDecisions) {
    if (dec.ownerId !== ownerId) continue;
    const prev = latestDecisionByBmId.get(dec.bookmarkId);
    if (!prev || dec.createdAt >= prev.createdAt) {
      latestDecisionByBmId.set(dec.bookmarkId, dec);
    }
  }

  const foldersByBmId = new Map<string, string[][]>();
  for (const occ of store.importOccurrences) {
    if (occ.ownerId === ownerId && occ.canonicalBookmarkId && occ.folderPath.length > 0) {
      const list = foldersByBmId.get(occ.canonicalBookmarkId) ?? [];
      list.push(occ.folderPath);
      foldersByBmId.set(occ.canonicalBookmarkId, list);
    }
  }

  return store.bookmarks
    .filter((b) => b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((row) => {
      const primaryCat = row.primaryCategoryId
        ? catMap.get(row.primaryCategoryId) ?? null
        : null;
      const parentCat =
        primaryCat && primaryCat.parentCategoryId
          ? catMap.get(primaryCat.parentCategoryId) ?? null
          : null;
      const dec = latestDecisionByBmId.get(row.id);

      return {
        ...row,
        primaryCategoryName: primaryCat ? primaryCat.name : null,
        parentCategoryId: parentCat ? parentCat.id : null,
        parentCategoryName: parentCat ? parentCat.name : null,
        tags: bmTagsByBmId.get(row.id) ?? [],
        latestDecision: dec
          ? {
              classificationMethod: dec.classificationMethod,
              confidence: dec.confidence,
              evidence: dec.evidence,
              matchedRuleIds: dec.matchedRuleIds,
              rulesetVersion: dec.rulesetVersion,
              requiresReview: dec.requiresReview,
              createdAt: dec.createdAt,
            }
          : null,
        sourceFolderPaths: foldersByBmId.get(row.id) ?? [],
      };
    });
}

export function fallbackFindByNormalizedKey(
  ownerId: string,
  normalizedUrlKey: string
): BookmarkRecord | null {
  const all = fallbackHydrateBookmarks(ownerId);
  return all.find((b) => b.normalizedUrlKey === normalizedUrlKey) ?? null;
}

export function fallbackInsertBookmark(
  ownerId: string,
  data: {
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    isFavorite: boolean;
    primaryCategoryId: string | null;
    categorySource: CategoryAssignmentSource;
    categoryLocked: boolean;
  }
): BookmarkRecord {
  const store = loadStore();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  store.bookmarks.push({
    id,
    ownerId,
    originalUrl: data.originalUrl,
    normalizedUrlKey: data.normalizedUrlKey,
    domain: data.domain,
    title: data.title,
    description: data.description,
    notes: data.notes,
    isFavorite: data.isFavorite,
    primaryCategoryId: data.primaryCategoryId,
    categorySource: data.categorySource,
    categoryLocked: data.categoryLocked,
    createdAt: now,
    updatedAt: now,
  });

  if (data.primaryCategoryId) {
    store.bookmarkPlacements.push({
      id: crypto.randomUUID(),
      ownerId,
      bookmarkId: id,
      categoryId: data.primaryCategoryId,
      isPrimary: true,
      assignmentSource: data.categorySource,
      isLocked: data.categoryLocked,
      createdAt: now,
      updatedAt: now,
    });
  }

  persistStore(store);
  return fallbackHydrateBookmarks(ownerId).find((b) => b.id === id)!;
}

export function fallbackAddSecondaryPlacement(
  ownerId: string,
  bookmarkId: string,
  categoryId: string,
  assignmentSource = 'import'
): void {
  const store = loadStore();
  const existing = store.bookmarkPlacements.find(
    (p) =>
      p.ownerId === ownerId &&
      p.bookmarkId === bookmarkId &&
      p.categoryId === categoryId
  );
  if (existing) {
    return;
  }

  const now = new Date().toISOString();
  store.bookmarkPlacements.push({
    id: crypto.randomUUID(),
    ownerId,
    bookmarkId,
    categoryId,
    isPrimary: false,
    assignmentSource,
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  });
  persistStore(store);
}

export function fallbackUpdateBookmark(
  ownerId: string,
  bookmarkId: string,
  updater: (
    current: Omit<
      BookmarkRecord,
      'primaryCategoryName' | 'parentCategoryId' | 'parentCategoryName'
    >
  ) => {
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    isFavorite: boolean;
    primaryCategoryId: string | null;
    categorySource: CategoryAssignmentSource;
    categoryLocked: boolean;
  }
): BookmarkRecord | null {
  const store = loadStore();
  const idx = store.bookmarks.findIndex(
    (b) => b.id === bookmarkId && b.ownerId === ownerId
  );
  if (idx === -1) return null;

  const current = store.bookmarks[idx];
  const next = updater(current);
  const now = new Date().toISOString();

  store.bookmarks[idx] = {
    ...current,
    ...next,
    updatedAt: now,
  };

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => !(p.bookmarkId === bookmarkId && p.isPrimary)
  );

  if (next.primaryCategoryId) {
    store.bookmarkPlacements.push({
      id: crypto.randomUUID(),
      ownerId,
      bookmarkId,
      categoryId: next.primaryCategoryId,
      isPrimary: true,
      assignmentSource: next.categorySource,
      isLocked: next.categoryLocked,
      createdAt: now,
      updatedAt: now,
    });
  }

  persistStore(store);
  return fallbackHydrateBookmarks(ownerId).find((b) => b.id === bookmarkId)!;
}

export function fallbackDeleteBookmark(
  ownerId: string,
  bookmarkId: string
): boolean {
  const store = loadStore();
  const before = store.bookmarks.length;
  store.bookmarks = store.bookmarks.filter(
    (b) => !(b.id === bookmarkId && b.ownerId === ownerId)
  );
  if (store.bookmarks.length === before) return false;

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => p.bookmarkId !== bookmarkId
  );
  store.classificationDecisions = store.classificationDecisions.filter(
    (d) => d.bookmarkId !== bookmarkId
  );
  store.classificationReviewQueue = store.classificationReviewQueue.filter(
    (r) => r.bookmarkId !== bookmarkId
  );
  store.bookmarkTags = store.bookmarkTags.filter(
    (bt) => bt.bookmarkId !== bookmarkId
  );
  persistStore(store);
  return true;
}

export function fallbackCreateImportJob(
  ownerId: string,
  data: {
    originalFilename: string;
    sourceBrowser: string | null;
    fileHash: string;
    status: 'preview' | 'processing' | 'completed' | 'failed' | 'partial';
    normalizationVersion: string;
    destinationCategoryId: string | null;
    destinationCategoryLabel: string | null;
    conflictStrategy: ImportConflictStrategy;
    filesCount: number;
    totalParsedEntries: number;
    uniqueUploadIdentities: number;
    withinUploadDuplicates: number;
    existingDbDuplicates: number;
    newCanonicalBookmarks: number;
    exactDuplicates: number;
    invalidRecords: number;
    missingTitlesCount: number;
    categoryConflictsCount: number;
    warningCount: number;
    previewTokenHash: string | null;
    stagedPayloadJson: string | null;
  }
): StoredImportJob {
  const store = loadStore();
  const now = new Date().toISOString();
  const created: StoredImportJob = {
    id: crypto.randomUUID(),
    ownerId,
    originalFilename: data.originalFilename,
    sourceBrowser: data.sourceBrowser,
    fileHash: data.fileHash,
    status: data.status,
    normalizationVersion: data.normalizationVersion,
    destinationCategoryId: data.destinationCategoryId,
    destinationCategoryLabel: data.destinationCategoryLabel,
    conflictStrategy: data.conflictStrategy,
    filesCount: data.filesCount,
    totalParsedEntries: data.totalParsedEntries,
    uniqueUploadIdentities: data.uniqueUploadIdentities,
    withinUploadDuplicates: data.withinUploadDuplicates,
    existingDbDuplicates: data.existingDbDuplicates,
    newCanonicalBookmarks: data.newCanonicalBookmarks,
    exactDuplicates: data.exactDuplicates,
    invalidRecords: data.invalidRecords,
    missingTitlesCount: data.missingTitlesCount,
    categoryConflictsCount: data.categoryConflictsCount,
    warningCount: data.warningCount,
    previewTokenHash: data.previewTokenHash,
    idempotencyKey: null,
    stagedPayloadJson: data.stagedPayloadJson,
    createdAt: now,
    completedAt: null,
  };
  store.importJobs.push(created);
  persistStore(store);
  return created;
}

export function fallbackGetImportJob(
  ownerId: string,
  jobId: string
): StoredImportJob | null {
  const store = loadStore();
  return (
    store.importJobs.find((j) => j.id === jobId && j.ownerId === ownerId) ?? null
  );
}

export function fallbackFindImportJobByIdempotencyKey(
  ownerId: string,
  idempotencyKey: string
): StoredImportJob | null {
  const store = loadStore();
  return (
    store.importJobs.find(
      (j) => j.ownerId === ownerId && j.idempotencyKey === idempotencyKey
    ) ?? null
  );
}

export function fallbackUpdateImportJob(
  ownerId: string,
  jobId: string,
  patch: Partial<StoredImportJob>
): StoredImportJob | null {
  const store = loadStore();
  const idx = store.importJobs.findIndex(
    (j) => j.id === jobId && j.ownerId === ownerId
  );
  if (idx === -1) return null;

  store.importJobs[idx] = {
    ...store.importJobs[idx],
    ...patch,
  };
  persistStore(store);
  return store.importJobs[idx];
}

export function fallbackListImportJobs(ownerId: string): ImportJobRecord[] {
  const store = loadStore();
  return store.importJobs
    .filter((j) => j.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(
      ({
        previewTokenHash: _pt,
        idempotencyKey: _ik,
        stagedPayloadJson: _sp,
        ...rest
      }) => rest
    );
}

export function fallbackInsertImportOccurrences(
  ownerId: string,
  importJobId: string,
  records: Omit<
    ImportOccurrenceRecord,
    'id' | 'ownerId' | 'importJobId' | 'createdAt'
  >[]
): ImportOccurrenceRecord[] {
  const store = loadStore();
  const now = new Date().toISOString();
  const existingSet = new Set(
    store.importOccurrences
      .filter((o) => o.importJobId === importJobId)
      .map((o) => o.occurrenceIndex)
  );

  const inserted: ImportOccurrenceRecord[] = [];
  for (const r of records) {
    if (existingSet.has(r.occurrenceIndex)) {
      continue;
    }
    const item: ImportOccurrenceRecord = {
      id: crypto.randomUUID(),
      ownerId,
      importJobId,
      canonicalBookmarkId: r.canonicalBookmarkId,
      occurrenceIndex: r.occurrenceIndex,
      sourceFilename: r.sourceFilename,
      originalUrl: r.originalUrl,
      normalizedUrlKey: r.normalizedUrlKey,
      originalTitle: r.originalTitle,
      displayTitle: r.displayTitle,
      folderPath: r.folderPath,
      addDate: r.addDate,
      lastModified: r.lastModified,
      sourceBrowser: r.sourceBrowser,
      sourceOrder: r.sourceOrder,
      resolutionStatus: r.resolutionStatus,
      warnings: r.warnings,
      createdAt: now,
    };
    store.importOccurrences.push(item);
    existingSet.add(r.occurrenceIndex);
    inserted.push(item);
  }
  persistStore(store);
  return inserted;
}

export function fallbackListImportOccurrences(
  ownerId: string,
  importJobId: string
): ImportOccurrenceRecord[] {
  const store = loadStore();
  return store.importOccurrences
    .filter((o) => o.ownerId === ownerId && o.importJobId === importJobId)
    .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);
}

export function fallbackListAllOwnerOccurrences(
  ownerId: string
): ImportOccurrenceRecord[] {
  const store = loadStore();
  return store.importOccurrences.filter((o) => o.ownerId === ownerId);
}

// Phase 3 Fallback Helpers
export function fallbackListClassificationRules(
  ownerId: string
): ClassificationRuleRecord[] {
  const store = loadStore();
  const catMap = new Map(
    store.categories.filter((c) => c.ownerId === ownerId).map((c) => [c.id, c])
  );
  return store.classificationRules
    .filter((r) => r.ownerId === ownerId)
    .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      ...r,
      targetCategoryName: catMap.get(r.targetCategoryId)?.name ?? null,
      targetSubcategoryName: r.targetSubcategoryId
        ? catMap.get(r.targetSubcategoryId)?.name ?? null
        : null,
    }));
}

export function fallbackCreateClassificationRule(
  ownerId: string,
  input: {
    name: string;
    ruleType: ClassificationRuleType;
    pattern: string;
    targetCategoryId: string;
    targetSubcategoryId: string | null;
    priority: number;
    confidenceScore: number;
    isEnabled?: boolean;
    source?: 'owner' | 'system_seed';
  }
): ClassificationRuleRecord {
  const store = loadStore();
  const now = new Date().toISOString();
  const created: ClassificationRuleRecord = {
    id: crypto.randomUUID(),
    ownerId,
    name: input.name,
    ruleType: input.ruleType,
    pattern: input.pattern,
    targetCategoryId: input.targetCategoryId,
    targetCategoryName: null,
    targetSubcategoryId: input.targetSubcategoryId,
    targetSubcategoryName: null,
    priority: input.priority,
    confidenceScore: input.confidenceScore,
    isEnabled: input.isEnabled ?? true,
    source: input.source ?? 'owner',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  store.classificationRules.push(created);
  persistStore(store);
  return fallbackListClassificationRules(ownerId).find(
    (r) => r.id === created.id
  )!;
}

export function fallbackUpdateClassificationRule(
  ownerId: string,
  ruleId: string,
  patch: Partial<{
    name: string;
    ruleType: ClassificationRuleType;
    pattern: string;
    targetCategoryId: string;
    targetSubcategoryId: string | null;
    priority: number;
    confidenceScore: number;
    isEnabled: boolean;
  }>
): ClassificationRuleRecord | null {
  const store = loadStore();
  const idx = store.classificationRules.findIndex(
    (r) => r.id === ruleId && r.ownerId === ownerId
  );
  if (idx === -1) return null;

  const curr = store.classificationRules[idx];
  store.classificationRules[idx] = {
    ...curr,
    ...patch,
    version: curr.version + 1,
    updatedAt: new Date().toISOString(),
  };
  persistStore(store);
  return (
    fallbackListClassificationRules(ownerId).find((r) => r.id === ruleId) ??
    null
  );
}

export function fallbackDeleteClassificationRule(
  ownerId: string,
  ruleId: string
): boolean {
  const store = loadStore();
  const before = store.classificationRules.length;
  store.classificationRules = store.classificationRules.filter(
    (r) => !(r.id === ruleId && r.ownerId === ownerId)
  );
  if (store.classificationRules.length === before) return false;
  persistStore(store);
  return true;
}

export function fallbackRecordClassificationDecision(
  ownerId: string,
  data: Omit<StoredClassificationDecision, 'id' | 'ownerId' | 'createdAt'>
): void {
  const store = loadStore();
  store.classificationDecisions.push({
    id: crypto.randomUUID(),
    ownerId,
    ...data,
    createdAt: new Date().toISOString(),
  });
  persistStore(store);
}

export function fallbackUpsertReviewQueueItem(
  ownerId: string,
  data: {
    bookmarkId: string;
    suggestedCategoryId: string | null;
    suggestedSubcategoryId: string | null;
    confidence: number;
    reviewReason: string;
    evidence: string[];
    sourceFolderPath: string[];
  }
): void {
  const store = loadStore();
  const existingIdx = store.classificationReviewQueue.findIndex(
    (r) =>
      r.ownerId === ownerId &&
      r.bookmarkId === data.bookmarkId &&
      r.status === 'pending'
  );
  const now = new Date().toISOString();
  const bms = fallbackHydrateBookmarks(ownerId);
  const bm = bms.find((b) => b.id === data.bookmarkId);
  const catMap = new Map(
    store.categories.filter((c) => c.ownerId === ownerId).map((c) => [c.id, c])
  );

  const item: ReviewQueueItemRecord = {
    id:
      existingIdx >= 0
        ? store.classificationReviewQueue[existingIdx].id
        : crypto.randomUUID(),
    ownerId,
    bookmarkId: data.bookmarkId,
    bookmarkTitle: bm?.title ?? 'Bookmark',
    bookmarkUrl: bm?.originalUrl ?? '',
    bookmarkDomain: bm?.domain ?? '',
    existingCategoryId: bm?.primaryCategoryId ?? null,
    existingCategoryLabel: bm?.primaryCategoryName ?? null,
    suggestedCategoryId: data.suggestedCategoryId,
    suggestedCategoryName: data.suggestedCategoryId
      ? catMap.get(data.suggestedCategoryId)?.name ?? null
      : null,
    suggestedSubcategoryId: data.suggestedSubcategoryId,
    suggestedSubcategoryName: data.suggestedSubcategoryId
      ? catMap.get(data.suggestedSubcategoryId)?.name ?? null
      : null,
    confidence: data.confidence,
    reviewReason: data.reviewReason,
    evidence: data.evidence,
    sourceFolderPath: data.sourceFolderPath,
    status: 'pending',
    createdAt:
      existingIdx >= 0
        ? store.classificationReviewQueue[existingIdx].createdAt
        : now,
    resolvedAt: null,
  };

  if (existingIdx >= 0) {
    store.classificationReviewQueue[existingIdx] = item;
  } else {
    store.classificationReviewQueue.push(item);
  }
  persistStore(store);
}

export function fallbackListReviewQueue(
  ownerId: string,
  statusFilter: string = 'pending'
): ReviewQueueItemRecord[] {
  const store = loadStore();
  const bms = fallbackHydrateBookmarks(ownerId);
  const bmMap = new Map(bms.map((b) => [b.id, b]));
  const catMap = new Map(
    store.categories.filter((c) => c.ownerId === ownerId).map((c) => [c.id, c])
  );

  return store.classificationReviewQueue
    .filter(
      (r) =>
        r.ownerId === ownerId &&
        (statusFilter === 'all' ? true : r.status === statusFilter)
    )
    .map((r) => {
      const bm = bmMap.get(r.bookmarkId);
      return {
        ...r,
        bookmarkTitle: bm?.title ?? r.bookmarkTitle,
        bookmarkUrl: bm?.originalUrl ?? r.bookmarkUrl,
        bookmarkDomain: bm?.domain ?? r.bookmarkDomain,
        existingCategoryId: bm?.primaryCategoryId ?? null,
        existingCategoryLabel: bm?.primaryCategoryName
          ? bm.parentCategoryName
            ? `${bm.parentCategoryName} / ${bm.primaryCategoryName}`
            : bm.primaryCategoryName
          : null,
        suggestedCategoryName: r.suggestedCategoryId
          ? catMap.get(r.suggestedCategoryId)?.name ?? null
          : null,
        suggestedSubcategoryName: r.suggestedSubcategoryId
          ? catMap.get(r.suggestedSubcategoryId)?.name ?? null
          : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function fallbackResolveReviewQueueItem(
  ownerId: string,
  bookmarkId: string,
  resolutionStatus: 'accepted' | 'corrected' | 'kept_uncategorized' | 'dismissed'
): void {
  const store = loadStore();
  const now = new Date().toISOString();
  for (const item of store.classificationReviewQueue) {
    if (
      item.ownerId === ownerId &&
      item.bookmarkId === bookmarkId &&
      item.status === 'pending'
    ) {
      item.status = resolutionStatus;
      item.resolvedAt = now;
    }
  }
  persistStore(store);
}

export function fallbackSyncBookmarkTags(
  ownerId: string,
  bookmarkId: string,
  tagNames: string[],
  source: 'manual' | 'auto_rule'
): TagRecord[] {
  const store = loadStore();
  const now = new Date().toISOString();

  if (source === 'manual') {
    // Replace manual tags with new list while preserving auto_rule tags not removed
    store.bookmarkTags = store.bookmarkTags.filter(
      (bt) => !(bt.ownerId === ownerId && bt.bookmarkId === bookmarkId)
    );
  }

  for (const raw of tagNames) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const norm = clean.toLowerCase();

    let tag = store.tags.find(
      (t) => t.ownerId === ownerId && t.normalizedName === norm
    );
    if (!tag) {
      tag = {
        id: crypto.randomUUID(),
        ownerId,
        name: clean,
        normalizedName: norm,
        createdAt: now,
      };
      store.tags.push(tag);
    }

    const existsLink = store.bookmarkTags.some(
      (bt) =>
        bt.ownerId === ownerId &&
        bt.bookmarkId === bookmarkId &&
        bt.tagId === tag!.id
    );
    if (!existsLink) {
      store.bookmarkTags.push({
        id: crypto.randomUUID(),
        ownerId,
        bookmarkId,
        tagId: tag.id,
        source,
        createdAt: now,
      });
    }
  }

  persistStore(store);
  const bm = fallbackHydrateBookmarks(ownerId).find((b) => b.id === bookmarkId);
  return bm?.tags ?? [];
}

export function fallbackEnsureSeeded(
  ownerId: string,
  seedFn: () => void
): void {
  const store = loadStore();
  if (store.seededOwners.includes(ownerId)) return;
  const hasCats = store.categories.some((c) => c.ownerId === ownerId);
  const hasBms = store.bookmarks.some((b) => b.ownerId === ownerId);
  if (!hasCats && !hasBms) {
    seedFn();
  }
  if (!store.seededOwners.includes(ownerId)) {
    store.seededOwners.push(ownerId);
    persistStore(store);
  }
}
