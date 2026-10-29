import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  bookmarkPlacements,
  bookmarks,
  categories,
  importJobs,
  importOccurrences,
} from '../../db/schema.ts';
import {
  fallbackAddSecondaryPlacement,
  fallbackCreateImportJob,
  fallbackFindByNormalizedKey,
  fallbackFindImportJobByIdempotencyKey,
  fallbackGetCategories,
  fallbackGetImportJob,
  fallbackInsertBookmark,
  fallbackInsertImportOccurrences,
  fallbackListImportJobs,
  fallbackListImportOccurrences,
  fallbackUpdateBookmark,
  fallbackUpdateImportJob,
} from '../../db/server-store.ts';
import type {
  CategoryRecord,
  ImportConflictStrategy,
  ImportJobRecord,
  ImportOccurrenceRecord,
  ImportPreviewResponse,
  ParsedHtmlBookmarkOccurrence,
} from '../../types/bookmark.ts';
import {
  listBookmarksForOwner,
} from '../bookmarks/service.ts';
import { resolveCategoryAssignment } from '../bookmarks/url-identity.ts';
import { autoClassifyBookmarksBatchForOwner } from '../classification/classification-service.ts';
import {
  InvalidImportFileError,
  NORMALIZATION_VERSION,
  parseNetscapeBookmarkFiles,
  reconcileBookmarkOccurrences,
  type UploadedBookmarkFileInput,
} from './html-parser.ts';

const BATCH_SIZE = 250;
const PREVIEW_SAMPLE_LIMIT = 250;

export class ImportJobNotFoundError extends Error {
  constructor(message = 'Import job not found.') {
    super(message);
    this.name = 'ImportJobNotFoundError';
  }
}

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

interface StagedImportPayload {
  selectedFilenames: string[];
  occurrences: ParsedHtmlBookmarkOccurrence[];
}

export interface CommitImportResult {
  job: ImportJobRecord;
  occurrences: ImportOccurrenceRecord[];
  resolutionBreakdown: {
    insertedCanonicalCount: number;
    withinUploadDuplicatesSkipped: number;
    existingDuplicatesKept: number;
    existingMovedToDestination: number;
    secondaryPlacementsAdded: number;
    invalidEntriesSkipped: number;
  };
}

async function ensurePhase2Tables(): Promise<void> {
  // Tables import_jobs and import_occurrences are provisioned in PostgreSQL
  return;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
}

function computeUploadHash(files: UploadedBookmarkFileInput[]): string {
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f.filename, 'utf-8');
    hash.update('\0', 'utf-8');
    hash.update(f.content, 'utf-8');
    hash.update('\0', 'utf-8');
  }
  return hash.digest('hex');
}

async function getOwnerCategoriesMap(
  ownerId: string
): Promise<Map<string, CategoryRecord>> {
  if (!process.env.SQL_HOST) {
    const cats = fallbackGetCategories(ownerId);
    return new Map(cats.map((c) => [c.id, c]));
  }

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.ownerId, ownerId));

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        parentCategoryId: r.parentCategoryId ?? null,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      },
    ])
  );
}

function formatCategoryLabel(
  categoryId: string | null,
  catMap: Map<string, CategoryRecord>
): string | null {
  if (!categoryId) return null;
  const cat = catMap.get(categoryId);
  if (!cat) return null;
  if (cat.parentCategoryId) {
    const parent = catMap.get(cat.parentCategoryId);
    if (parent) {
      return `${parent.name} / ${cat.name}`;
    }
  }
  return cat.name;
}

function sanitizeConflictStrategy(
  raw?: string | null
): ImportConflictStrategy {
  if (
    raw === 'move_to_selected' ||
    raw === 'add_secondary_placement' ||
    raw === 'keep_existing'
  ) {
    return raw;
  }
  return 'keep_existing';
}

function mapDbJobToRecord(
  row: typeof importJobs.$inferSelect,
  catMap: Map<string, CategoryRecord>
): ImportJobRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    originalFilename: row.originalFilename,
    sourceBrowser: row.sourceBrowser ?? null,
    fileHash: row.fileHash,
    status: row.status as ImportJobRecord['status'],
    normalizationVersion: row.normalizationVersion,
    destinationCategoryId: row.destinationCategoryId ?? null,
    destinationCategoryLabel: formatCategoryLabel(
      row.destinationCategoryId ?? null,
      catMap
    ),
    conflictStrategy: sanitizeConflictStrategy(row.conflictStrategy),
    filesCount: row.filesCount,
    totalParsedEntries: row.totalParsedEntries,
    uniqueUploadIdentities: row.uniqueUploadIdentities,
    withinUploadDuplicates: row.withinUploadDuplicates,
    existingDbDuplicates: row.existingDbDuplicates,
    newCanonicalBookmarks: row.newCanonicalBookmarks,
    exactDuplicates: row.exactDuplicates,
    invalidRecords: row.invalidRecords,
    missingTitlesCount: row.missingTitlesCount,
    categoryConflictsCount: row.categoryConflictsCount,
    warningCount: row.warningCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function mapDbOccurrenceToRecord(
  row: typeof importOccurrences.$inferSelect
): ImportOccurrenceRecord {
  let folderPath: string[] = [];
  try {
    const parsed = JSON.parse(row.folderPathJson);
    if (Array.isArray(parsed)) {
      folderPath = parsed.map((s) => String(s));
    }
  } catch {
    folderPath = [];
  }

  let warnings: string[] = [];
  if (row.warningsJson) {
    try {
      const parsed = JSON.parse(row.warningsJson);
      if (Array.isArray(parsed)) {
        warnings = parsed.map((s) => String(s));
      }
    } catch {
      warnings = [];
    }
  }

  return {
    id: row.id,
    ownerId: row.ownerId,
    importJobId: row.importJobId,
    canonicalBookmarkId: row.canonicalBookmarkId ?? null,
    occurrenceIndex: row.occurrenceIndex,
    sourceFilename: row.sourceFilename,
    originalUrl: row.originalUrl,
    normalizedUrlKey: row.normalizedUrlKey ?? null,
    originalTitle: row.originalTitle,
    displayTitle: row.displayTitle,
    folderPath,
    addDate: row.addDate ?? null,
    lastModified: row.lastModified ?? null,
    sourceBrowser: row.sourceBrowser ?? null,
    sourceOrder: row.sourceOrder,
    resolutionStatus: row.resolutionStatus,
    warnings,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createImportPreviewForOwner(
  ownerId: string,
  input: {
    files: UploadedBookmarkFileInput[];
    destinationCategoryId?: string | null;
    conflictStrategy?: string | null;
    sourceBrowserHint?: string | null;
  }
): Promise<ImportPreviewResponse> {
  await ensurePhase2Tables();

  const filesWithHint = (input.files || []).map((f) => ({
    ...f,
    sourceBrowserHint: f.sourceBrowserHint ?? input.sourceBrowserHint ?? null,
  }));

  const { occurrences, detectedBrowser } =
    parseNetscapeBookmarkFiles(filesWithHint);

  const [existingBookmarks, catMap] = await Promise.all([
    listBookmarksForOwner(ownerId),
    getOwnerCategoriesMap(ownerId),
  ]);

  const requestedCatId =
    input.destinationCategoryId && input.destinationCategoryId.trim().length > 0
      ? input.destinationCategoryId.trim()
      : null;

  const validDestCategoryId =
    requestedCatId && catMap.has(requestedCatId) ? requestedCatId : null;
  const destinationCategoryLabel = formatCategoryLabel(
    validDestCategoryId,
    catMap
  );
  const conflictStrategy = sanitizeConflictStrategy(input.conflictStrategy);

  const { entries, metrics } = reconcileBookmarkOccurrences(
    occurrences,
    existingBookmarks,
    validDestCategoryId,
    filesWithHint.length
  );

  const selectedFilenames = filesWithHint.map((f) => f.filename);
  const displayFilename =
    selectedFilenames.length === 1
      ? selectedFilenames[0]
      : `${selectedFilenames[0]} (+${selectedFilenames.length - 1} more)`;

  const fileHash = computeUploadHash(filesWithHint);
  const previewToken = crypto.randomBytes(24).toString('hex');
  const previewTokenHash = sha256Hex(previewToken);

  const stagedPayload: StagedImportPayload = {
    selectedFilenames,
    occurrences,
  };
  const stagedPayloadJson = JSON.stringify(stagedPayload);

  if (!process.env.SQL_HOST) {
    const createdJob = fallbackCreateImportJob(ownerId, {
      originalFilename: displayFilename,
      sourceBrowser: detectedBrowser,
      fileHash,
      status: 'preview',
      normalizationVersion: NORMALIZATION_VERSION,
      destinationCategoryId: validDestCategoryId,
      destinationCategoryLabel,
      conflictStrategy,
      filesCount: metrics.filesCount,
      totalParsedEntries: metrics.totalParsedEntries,
      uniqueUploadIdentities: metrics.uniqueUploadIdentities,
      withinUploadDuplicates: metrics.withinUploadDuplicates,
      existingDbDuplicates: metrics.existingDbDuplicates,
      newCanonicalBookmarks: metrics.newCanonicalBookmarks,
      exactDuplicates: metrics.exactDuplicates,
      invalidRecords: metrics.invalidRecords,
      missingTitlesCount: metrics.missingTitlesCount,
      categoryConflictsCount: metrics.categoryConflictsCount,
      warningCount: metrics.warningCount,
      previewTokenHash,
      stagedPayloadJson,
    });

    const {
      previewTokenHash: _pt,
      idempotencyKey: _ik,
      stagedPayloadJson: _sp,
      ...publicJob
    } = createdJob;

    return {
      job: publicJob,
      previewToken,
      selectedFilenames,
      sampleEntries: entries.slice(0, PREVIEW_SAMPLE_LIMIT),
      totalSampleCount: entries.length,
    };
  }

  const [insertedJob] = await db
    .insert(importJobs)
    .values({
      ownerId,
      originalFilename: displayFilename,
      sourceBrowser: detectedBrowser,
      fileHash,
      status: 'preview',
      normalizationVersion: NORMALIZATION_VERSION,
      destinationCategoryId: validDestCategoryId,
      conflictStrategy,
      filesCount: metrics.filesCount,
      totalParsedEntries: metrics.totalParsedEntries,
      uniqueUploadIdentities: metrics.uniqueUploadIdentities,
      withinUploadDuplicates: metrics.withinUploadDuplicates,
      existingDbDuplicates: metrics.existingDbDuplicates,
      newCanonicalBookmarks: metrics.newCanonicalBookmarks,
      exactDuplicates: metrics.exactDuplicates,
      invalidRecords: metrics.invalidRecords,
      missingTitlesCount: metrics.missingTitlesCount,
      categoryConflictsCount: metrics.categoryConflictsCount,
      warningCount: metrics.warningCount,
      previewTokenHash,
      stagedPayloadJson,
    })
    .returning();

  return {
    job: mapDbJobToRecord(insertedJob, catMap),
    previewToken,
    selectedFilenames,
    sampleEntries: entries.slice(0, PREVIEW_SAMPLE_LIMIT),
    totalSampleCount: entries.length,
  };
}

export async function commitImportJobForOwner(
  ownerId: string,
  jobId: string,
  input: {
    previewToken: string;
    idempotencyKey?: string | null;
    destinationCategoryId?: string | null;
    conflictStrategy?: string | null;
    confirmOverrideManualLocks?: boolean;
  }
): Promise<CommitImportResult> {
  await ensurePhase2Tables();

  const rawToken = (input.previewToken || '').trim();
  if (!rawToken) {
    throw new ImportValidationError(
      'Missing preview confirmation token. Please preview the import before confirming.'
    );
  }
  const incomingTokenHash = sha256Hex(rawToken);
  const cleanIdempotencyKey =
    input.idempotencyKey && input.idempotencyKey.trim().length > 0
      ? `${ownerId}:${input.idempotencyKey.trim()}`
      : null;

  const catMap = await getOwnerCategoriesMap(ownerId);

  if (!process.env.SQL_HOST) {
    if (cleanIdempotencyKey) {
      const idemExisting = fallbackFindImportJobByIdempotencyKey(
        ownerId,
        cleanIdempotencyKey
      );
      if (idemExisting && idemExisting.status === 'completed') {
        const occs = fallbackListImportOccurrences(ownerId, idemExisting.id);
        const {
          previewTokenHash: _pt,
          idempotencyKey: _ik,
          stagedPayloadJson: _sp,
          ...publicJob
        } = idemExisting;
        return {
          job: publicJob,
          occurrences: occs,
          resolutionBreakdown: computeBreakdownFromOccurrences(occs),
        };
      }
    }

    const storedJob = fallbackGetImportJob(ownerId, jobId);
    if (!storedJob) {
      throw new ImportJobNotFoundError();
    }

    if (storedJob.status === 'completed') {
      const occs = fallbackListImportOccurrences(ownerId, storedJob.id);
      const {
        previewTokenHash: _pt,
        idempotencyKey: _ik,
        stagedPayloadJson: _sp,
        ...publicJob
      } = storedJob;
      return {
        job: publicJob,
        occurrences: occs,
        resolutionBreakdown: computeBreakdownFromOccurrences(occs),
      };
    }

    if (
      !storedJob.previewTokenHash ||
      storedJob.previewTokenHash !== incomingTokenHash
    ) {
      throw new ImportValidationError(
        'Invalid preview token for this import job. Please generate a fresh preview.'
      );
    }

    if (!storedJob.stagedPayloadJson) {
      throw new ImportValidationError(
        'Staged import payload is no longer available. Please re-upload the file to preview.'
      );
    }

    const staged = JSON.parse(
      storedJob.stagedPayloadJson
    ) as StagedImportPayload;

    const requestedCatId =
      input.destinationCategoryId !== undefined
        ? input.destinationCategoryId &&
          input.destinationCategoryId.trim().length > 0
          ? input.destinationCategoryId.trim()
          : null
        : storedJob.destinationCategoryId;

    const validDestCategoryId =
      requestedCatId && catMap.has(requestedCatId) ? requestedCatId : null;
    const destinationCategoryLabel = formatCategoryLabel(
      validDestCategoryId,
      catMap
    );
    const conflictStrategy =
      input.conflictStrategy !== undefined
        ? sanitizeConflictStrategy(input.conflictStrategy)
        : storedJob.conflictStrategy;

    const existingBookmarks = await listBookmarksForOwner(ownerId);
    const { entries, metrics } = reconcileBookmarkOccurrences(
      staged.occurrences,
      existingBookmarks,
      validDestCategoryId,
      storedJob.filesCount
    );

    const canonicalIdByNormalizedKey = new Map<string, string>();
    for (const bm of existingBookmarks) {
      canonicalIdByNormalizedKey.set(bm.normalizedUrlKey, bm.id);
    }

    let insertedCanonicalCount = 0;
    let withinUploadDuplicatesSkipped = 0;
    let existingDuplicatesKept = 0;
    let existingMovedToDestination = 0;
    let secondaryPlacementsAdded = 0;
    let invalidEntriesSkipped = 0;
    const newlyInsertedIds: string[] = [];

    const occurrenceToInsert: Omit<
      ImportOccurrenceRecord,
      'id' | 'ownerId' | 'importJobId' | 'createdAt'
    >[] = [];

    for (const entry of entries) {
      let canonicalBookmarkId: string | null = null;
      let resolutionStatus = 'invalid_skipped';

      if (entry.status === 'invalid' || !entry.normalizedUrlKey) {
        invalidEntriesSkipped += 1;
        resolutionStatus = 'invalid_skipped';
      } else if (entry.status === 'new') {
        const alreadyCreatedId = canonicalIdByNormalizedKey.get(
          entry.normalizedUrlKey
        );
        if (alreadyCreatedId) {
          canonicalBookmarkId = alreadyCreatedId;
          withinUploadDuplicatesSkipped += 1;
          resolutionStatus = 'duplicate_in_upload';
        } else {
          const assignment = resolveCategoryAssignment(validDestCategoryId);
          const created = fallbackInsertBookmark(ownerId, {
            originalUrl: entry.originalUrl,
            normalizedUrlKey: entry.normalizedUrlKey,
            domain: entry.domain || 'unknown',
            title: entry.displayTitle,
            description: null,
            notes: null,
            isFavorite: false,
            primaryCategoryId: assignment.primaryCategoryId,
            categorySource: assignment.categorySource,
            categoryLocked: assignment.categoryLocked,
          });
          canonicalBookmarkId = created.id;
          canonicalIdByNormalizedKey.set(entry.normalizedUrlKey, created.id);
          insertedCanonicalCount += 1;
          newlyInsertedIds.push(created.id);
          resolutionStatus = 'inserted_new';
        }
      } else if (entry.status === 'duplicate_in_upload') {
        withinUploadDuplicatesSkipped += 1;
        canonicalBookmarkId =
          canonicalIdByNormalizedKey.get(entry.normalizedUrlKey) ??
          entry.existingBookmarkId ??
          null;
        resolutionStatus = 'duplicate_in_upload';
      } else if (
        entry.status === 'duplicate_in_db' ||
        entry.status === 'category_conflict'
      ) {
        const existingBm = fallbackFindByNormalizedKey(
          ownerId,
          entry.normalizedUrlKey
        );
        canonicalBookmarkId = existingBm
          ? existingBm.id
          : entry.existingBookmarkId;

        if (
          existingBm &&
          validDestCategoryId &&
          existingBm.primaryCategoryId !== validDestCategoryId
        ) {
          if (conflictStrategy === 'move_to_selected') {
            if (
              existingBm.categoryLocked &&
              !input.confirmOverrideManualLocks
            ) {
              existingDuplicatesKept += 1;
              resolutionStatus = 'duplicate_kept_manual_lock';
            } else {
              fallbackUpdateBookmark(ownerId, existingBm.id, (curr) => ({
                ...curr,
                primaryCategoryId: validDestCategoryId,
                categorySource: 'manual',
                categoryLocked: true,
              }));
              existingMovedToDestination += 1;
              resolutionStatus = 'duplicate_moved_to_selected';
            }
          } else if (conflictStrategy === 'add_secondary_placement') {
            fallbackAddSecondaryPlacement(
              ownerId,
              existingBm.id,
              validDestCategoryId,
              'import'
            );
            secondaryPlacementsAdded += 1;
            resolutionStatus = 'duplicate_secondary_placement_added';
          } else {
            existingDuplicatesKept += 1;
            resolutionStatus = 'duplicate_kept_existing';
          }
        } else {
          existingDuplicatesKept += 1;
          resolutionStatus = 'duplicate_kept_existing';
        }
      }

      occurrenceToInsert.push({
        canonicalBookmarkId,
        occurrenceIndex: entry.occurrenceIndex,
        sourceFilename: entry.sourceFilename,
        originalUrl: entry.originalUrl,
        normalizedUrlKey: entry.normalizedUrlKey,
        originalTitle: entry.originalTitle,
        displayTitle: entry.displayTitle,
        folderPath: entry.folderPath,
        addDate: entry.addDate,
        lastModified: entry.lastModified,
        sourceBrowser: entry.sourceBrowser,
        sourceOrder: entry.sourceOrder,
        resolutionStatus,
        warnings: entry.warnings,
      });
    }

    const savedOccurrences = fallbackInsertImportOccurrences(
      ownerId,
      jobId,
      occurrenceToInsert
    );

    if (!validDestCategoryId && newlyInsertedIds.length > 0) {
      try {
        await autoClassifyBookmarksBatchForOwner(ownerId, newlyInsertedIds);
      } catch (err) {
        console.error('Non-fatal auto-classification error after fallback import:', err);
      }
    }

    const updatedJob = fallbackUpdateImportJob(ownerId, jobId, {
      status: 'completed',
      destinationCategoryId: validDestCategoryId,
      destinationCategoryLabel,
      conflictStrategy,
      totalParsedEntries: metrics.totalParsedEntries,
      uniqueUploadIdentities: metrics.uniqueUploadIdentities,
      withinUploadDuplicates: metrics.withinUploadDuplicates,
      existingDbDuplicates: metrics.existingDbDuplicates,
      newCanonicalBookmarks: insertedCanonicalCount,
      exactDuplicates: metrics.exactDuplicates,
      invalidRecords: metrics.invalidRecords,
      missingTitlesCount: metrics.missingTitlesCount,
      categoryConflictsCount: metrics.categoryConflictsCount,
      warningCount: metrics.warningCount,
      idempotencyKey: cleanIdempotencyKey,
      stagedPayloadJson: null,
      completedAt: new Date().toISOString(),
    })!;

    const {
      previewTokenHash: _pt,
      idempotencyKey: _ik,
      stagedPayloadJson: _sp,
      ...publicJob
    } = updatedJob;

    return {
      job: publicJob,
      occurrences: savedOccurrences,
      resolutionBreakdown: {
        insertedCanonicalCount,
        withinUploadDuplicatesSkipped,
        existingDuplicatesKept,
        existingMovedToDestination,
        secondaryPlacementsAdded,
        invalidEntriesSkipped,
      },
    };
  }

  // PostgreSQL path
  if (cleanIdempotencyKey) {
    const idemRows = await db
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.ownerId, ownerId),
          eq(importJobs.idempotencyKey, cleanIdempotencyKey)
        )
      )
      .limit(1);

    if (idemRows.length > 0 && idemRows[0].status === 'completed') {
      const occRows = await db
        .select()
        .from(importOccurrences)
        .where(
          and(
            eq(importOccurrences.ownerId, ownerId),
            eq(importOccurrences.importJobId, idemRows[0].id)
          )
        )
        .orderBy(importOccurrences.occurrenceIndex);
      const occs = occRows.map(mapDbOccurrenceToRecord);
      return {
        job: mapDbJobToRecord(idemRows[0], catMap),
        occurrences: occs,
        resolutionBreakdown: computeBreakdownFromOccurrences(occs),
      };
    }
  }

  const jobRows = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId)))
    .limit(1);

  if (jobRows.length === 0) {
    throw new ImportJobNotFoundError();
  }

  const jobRow = jobRows[0];

  if (jobRow.status === 'completed') {
    const occRows = await db
      .select()
      .from(importOccurrences)
      .where(
        and(
          eq(importOccurrences.ownerId, ownerId),
          eq(importOccurrences.importJobId, jobRow.id)
        )
      )
      .orderBy(importOccurrences.occurrenceIndex);
    const occs = occRows.map(mapDbOccurrenceToRecord);
    return {
      job: mapDbJobToRecord(jobRow, catMap),
      occurrences: occs,
      resolutionBreakdown: computeBreakdownFromOccurrences(occs),
    };
  }

  if (
    !jobRow.previewTokenHash ||
    jobRow.previewTokenHash !== incomingTokenHash
  ) {
    throw new ImportValidationError(
      'Invalid preview token for this import job. Please generate a fresh preview.'
    );
  }

  if (!jobRow.stagedPayloadJson) {
    throw new ImportValidationError(
      'Staged import payload is no longer available. Please re-upload the file to preview.'
    );
  }

  const staged = JSON.parse(jobRow.stagedPayloadJson) as StagedImportPayload;

  const requestedCatId =
    input.destinationCategoryId !== undefined
      ? input.destinationCategoryId &&
        input.destinationCategoryId.trim().length > 0
        ? input.destinationCategoryId.trim()
        : null
      : jobRow.destinationCategoryId;

  const validDestCategoryId =
    requestedCatId && catMap.has(requestedCatId) ? requestedCatId : null;
  const conflictStrategy =
    input.conflictStrategy !== undefined
      ? sanitizeConflictStrategy(input.conflictStrategy)
      : sanitizeConflictStrategy(jobRow.conflictStrategy);

  const existingBookmarks = await listBookmarksForOwner(ownerId);
  const { entries, metrics } = reconcileBookmarkOccurrences(
    staged.occurrences,
    existingBookmarks,
    validDestCategoryId,
    jobRow.filesCount
  );

  const existingByKey = new Map(
    existingBookmarks.map((b) => [b.normalizedUrlKey, b])
  );
  const canonicalIdByNormalizedKey = new Map<string, string>(
    existingBookmarks.map((b) => [b.normalizedUrlKey, b.id])
  );

  let insertedCanonicalCount = 0;
  let withinUploadDuplicatesSkipped = 0;
  let existingDuplicatesKept = 0;
  let existingMovedToDestination = 0;
  let secondaryPlacementsAdded = 0;
  let invalidEntriesSkipped = 0;
  const newlyInsertedIds: string[] = [];

  // Ensure any partial occurrences from an interrupted retry are cleared before batch commit
  await db
    .delete(importOccurrences)
    .where(
      and(
        eq(importOccurrences.importJobId, jobId),
        eq(importOccurrences.ownerId, ownerId)
      )
    );

  // Process in bounded batches
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const chunk = entries.slice(offset, offset + BATCH_SIZE);

    await db.transaction(async (tx) => {
      const occValues: (typeof importOccurrences.$inferInsert)[] = [];

      for (const entry of chunk) {
        let canonicalBookmarkId: string | null = null;
        let resolutionStatus = 'invalid_skipped';

        if (entry.status === 'invalid' || !entry.normalizedUrlKey) {
          invalidEntriesSkipped += 1;
          resolutionStatus = 'invalid_skipped';
        } else if (entry.status === 'new') {
          const existingId = canonicalIdByNormalizedKey.get(
            entry.normalizedUrlKey
          );
          if (existingId) {
            canonicalBookmarkId = existingId;
            withinUploadDuplicatesSkipped += 1;
            resolutionStatus = 'duplicate_in_upload';
          } else {
            const assignment = resolveCategoryAssignment(validDestCategoryId);
            const insertedRows = await tx
              .insert(bookmarks)
              .values({
                ownerId,
                originalUrl: entry.originalUrl,
                normalizedUrlKey: entry.normalizedUrlKey,
                domain: entry.domain || 'unknown',
                title: entry.displayTitle,
                description: null,
                notes: null,
                isFavorite: false,
                primaryCategoryId: assignment.primaryCategoryId,
                categorySource: assignment.categorySource,
                categoryLocked: assignment.categoryLocked,
              })
              .onConflictDoNothing({
                target: [bookmarks.ownerId, bookmarks.normalizedUrlKey],
              })
              .returning({ id: bookmarks.id });

            if (insertedRows.length > 0) {
              const newId = insertedRows[0].id;
              canonicalBookmarkId = newId;
              canonicalIdByNormalizedKey.set(entry.normalizedUrlKey, newId);
              insertedCanonicalCount += 1;
              newlyInsertedIds.push(newId);
              resolutionStatus = 'inserted_new';

              if (assignment.primaryCategoryId) {
                await tx
                  .insert(bookmarkPlacements)
                  .values({
                    ownerId,
                    bookmarkId: newId,
                    categoryId: assignment.primaryCategoryId,
                    isPrimary: true,
                    assignmentSource: 'manual',
                    isLocked: true,
                  })
                  .onConflictDoNothing();
              }
            } else {
              // Concurrent insert fallback lookup
              const fallbackRows = await tx
                .select({ id: bookmarks.id })
                .from(bookmarks)
                .where(
                  and(
                    eq(bookmarks.ownerId, ownerId),
                    eq(bookmarks.normalizedUrlKey, entry.normalizedUrlKey)
                  )
                )
                .limit(1);
              canonicalBookmarkId = fallbackRows[0]?.id ?? null;
              if (canonicalBookmarkId) {
                canonicalIdByNormalizedKey.set(
                  entry.normalizedUrlKey,
                  canonicalBookmarkId
                );
              }
              existingDuplicatesKept += 1;
              resolutionStatus = 'duplicate_kept_existing';
            }
          }
        } else if (entry.status === 'duplicate_in_upload') {
          withinUploadDuplicatesSkipped += 1;
          canonicalBookmarkId =
            canonicalIdByNormalizedKey.get(entry.normalizedUrlKey) ??
            entry.existingBookmarkId ??
            null;
          resolutionStatus = 'duplicate_in_upload';
        } else if (
          entry.status === 'duplicate_in_db' ||
          entry.status === 'category_conflict'
        ) {
          const existingBm = existingByKey.get(entry.normalizedUrlKey);
          canonicalBookmarkId = existingBm
            ? existingBm.id
            : entry.existingBookmarkId;

          if (
            existingBm &&
            validDestCategoryId &&
            existingBm.primaryCategoryId !== validDestCategoryId
          ) {
            if (conflictStrategy === 'move_to_selected') {
              if (
                existingBm.categoryLocked &&
                !input.confirmOverrideManualLocks
              ) {
                existingDuplicatesKept += 1;
                resolutionStatus = 'duplicate_kept_manual_lock';
              } else {
                await tx
                  .update(bookmarks)
                  .set({
                    primaryCategoryId: validDestCategoryId,
                    categorySource: 'manual',
                    categoryLocked: true,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(bookmarks.id, existingBm.id),
                      eq(bookmarks.ownerId, ownerId)
                    )
                  );

                await tx
                  .delete(bookmarkPlacements)
                  .where(
                    and(
                      eq(bookmarkPlacements.bookmarkId, existingBm.id),
                      eq(bookmarkPlacements.isPrimary, true)
                    )
                  );

                await tx
                  .insert(bookmarkPlacements)
                  .values({
                    ownerId,
                    bookmarkId: existingBm.id,
                    categoryId: validDestCategoryId,
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

                existingMovedToDestination += 1;
                resolutionStatus = 'duplicate_moved_to_selected';
              }
            } else if (conflictStrategy === 'add_secondary_placement') {
              await tx
                .insert(bookmarkPlacements)
                .values({
                  ownerId,
                  bookmarkId: existingBm.id,
                  categoryId: validDestCategoryId,
                  isPrimary: false,
                  assignmentSource: 'import',
                  isLocked: false,
                })
                .onConflictDoNothing({
                  target: [
                    bookmarkPlacements.bookmarkId,
                    bookmarkPlacements.categoryId,
                  ],
                });

              secondaryPlacementsAdded += 1;
              resolutionStatus = 'duplicate_secondary_placement_added';
            } else {
              existingDuplicatesKept += 1;
              resolutionStatus = 'duplicate_kept_existing';
            }
          } else {
            existingDuplicatesKept += 1;
            resolutionStatus = 'duplicate_kept_existing';
          }
        }

        occValues.push({
          ownerId,
          importJobId: jobId,
          canonicalBookmarkId,
          occurrenceIndex: entry.occurrenceIndex,
          sourceFilename: entry.sourceFilename,
          originalUrl: entry.originalUrl,
          normalizedUrlKey: entry.normalizedUrlKey,
          originalTitle: entry.originalTitle,
          displayTitle: entry.displayTitle,
          folderPathJson: JSON.stringify(entry.folderPath),
          addDate: entry.addDate,
          lastModified: entry.lastModified,
          sourceBrowser: entry.sourceBrowser,
          sourceOrder: entry.sourceOrder,
          resolutionStatus,
          warningsJson: JSON.stringify(entry.warnings),
        });
      }

      if (occValues.length > 0) {
        await tx.insert(importOccurrences).values(occValues);
      }
    });
  }

  if (!validDestCategoryId && newlyInsertedIds.length > 0) {
    try {
      await autoClassifyBookmarksBatchForOwner(ownerId, newlyInsertedIds);
    } catch (err) {
      console.error('Non-fatal auto-classification error after PostgreSQL import:', err);
    }
  }

  const [updatedJobRow] = await db
    .update(importJobs)
    .set({
      status: 'completed',
      destinationCategoryId: validDestCategoryId,
      conflictStrategy,
      totalParsedEntries: metrics.totalParsedEntries,
      uniqueUploadIdentities: metrics.uniqueUploadIdentities,
      withinUploadDuplicates: metrics.withinUploadDuplicates,
      existingDbDuplicates: metrics.existingDbDuplicates,
      newCanonicalBookmarks: insertedCanonicalCount,
      exactDuplicates: metrics.exactDuplicates,
      invalidRecords: metrics.invalidRecords,
      missingTitlesCount: metrics.missingTitlesCount,
      categoryConflictsCount: metrics.categoryConflictsCount,
      warningCount: metrics.warningCount,
      idempotencyKey: cleanIdempotencyKey,
      stagedPayloadJson: null,
      completedAt: new Date(),
    })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId)))
    .returning();

  const savedOccRows = await db
    .select()
    .from(importOccurrences)
    .where(
      and(
        eq(importOccurrences.ownerId, ownerId),
        eq(importOccurrences.importJobId, jobId)
      )
    )
    .orderBy(importOccurrences.occurrenceIndex);

  return {
    job: mapDbJobToRecord(updatedJobRow, catMap),
    occurrences: savedOccRows.map(mapDbOccurrenceToRecord),
    resolutionBreakdown: {
      insertedCanonicalCount,
      withinUploadDuplicatesSkipped,
      existingDuplicatesKept,
      existingMovedToDestination,
      secondaryPlacementsAdded,
      invalidEntriesSkipped,
    },
  };
}

function computeBreakdownFromOccurrences(occurrences: ImportOccurrenceRecord[]) {
  let insertedCanonicalCount = 0;
  let withinUploadDuplicatesSkipped = 0;
  let existingDuplicatesKept = 0;
  let existingMovedToDestination = 0;
  let secondaryPlacementsAdded = 0;
  let invalidEntriesSkipped = 0;

  for (const occ of occurrences) {
    switch (occ.resolutionStatus) {
      case 'inserted_new':
        insertedCanonicalCount += 1;
        break;
      case 'duplicate_in_upload':
        withinUploadDuplicatesSkipped += 1;
        break;
      case 'duplicate_moved_to_selected':
        existingMovedToDestination += 1;
        break;
      case 'duplicate_secondary_placement_added':
        secondaryPlacementsAdded += 1;
        break;
      case 'invalid_skipped':
        invalidEntriesSkipped += 1;
        break;
      default:
        existingDuplicatesKept += 1;
        break;
    }
  }

  return {
    insertedCanonicalCount,
    withinUploadDuplicatesSkipped,
    existingDuplicatesKept,
    existingMovedToDestination,
    secondaryPlacementsAdded,
    invalidEntriesSkipped,
  };
}

export async function listImportJobsForOwner(
  ownerId: string
): Promise<ImportJobRecord[]> {
  await ensurePhase2Tables();
  const catMap = await getOwnerCategoriesMap(ownerId);

  if (!process.env.SQL_HOST) {
    return fallbackListImportJobs(ownerId).map((j) => ({
      ...j,
      destinationCategoryLabel: formatCategoryLabel(
        j.destinationCategoryId,
        catMap
      ),
    }));
  }

  const rows = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.ownerId, ownerId))
    .orderBy(desc(importJobs.createdAt));

  return rows.map((r) => mapDbJobToRecord(r, catMap));
}

export async function getImportJobDetailsForOwner(
  ownerId: string,
  jobId: string
): Promise<{
  job: ImportJobRecord;
  occurrences: ImportOccurrenceRecord[];
  resolutionBreakdown: {
    insertedCanonicalCount: number;
    withinUploadDuplicatesSkipped: number;
    existingDuplicatesKept: number;
    existingMovedToDestination: number;
    secondaryPlacementsAdded: number;
    invalidEntriesSkipped: number;
  };
}> {
  await ensurePhase2Tables();
  const catMap = await getOwnerCategoriesMap(ownerId);

  if (!process.env.SQL_HOST) {
    const job = fallbackGetImportJob(ownerId, jobId);
    if (!job) {
      throw new ImportJobNotFoundError();
    }
    const occurrences = fallbackListImportOccurrences(ownerId, jobId);
    const {
      previewTokenHash: _pt,
      idempotencyKey: _ik,
      stagedPayloadJson: _sp,
      ...publicJob
    } = job;
    return {
      job: {
        ...publicJob,
        destinationCategoryLabel: formatCategoryLabel(
          publicJob.destinationCategoryId,
          catMap
        ),
      },
      occurrences,
      resolutionBreakdown: computeBreakdownFromOccurrences(occurrences),
    };
  }

  const jobRows = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId)))
    .limit(1);

  if (jobRows.length === 0) {
    throw new ImportJobNotFoundError();
  }

  const occRows = await db
    .select()
    .from(importOccurrences)
    .where(
      and(
        eq(importOccurrences.ownerId, ownerId),
        eq(importOccurrences.importJobId, jobId)
      )
    )
    .orderBy(importOccurrences.occurrenceIndex);

  const occurrences = occRows.map(mapDbOccurrenceToRecord);
  return {
    job: mapDbJobToRecord(jobRows[0], catMap),
    occurrences,
    resolutionBreakdown: computeBreakdownFromOccurrences(occurrences),
  };
}

export { InvalidImportFileError };
