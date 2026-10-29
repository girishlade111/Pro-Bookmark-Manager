import { Parser } from 'htmlparser2';
import {
  InvalidBookmarkUrlError,
  normalizeBookmarkUrl,
} from '../bookmarks/url-identity.ts';
import type {
  BookmarkRecord,
  ParsedHtmlBookmarkOccurrence,
  ReconciledImportEntry,
} from '../../types/bookmark.ts';

export const NORMALIZATION_VERSION = 'v1-conservative-full-url';
export const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_IMPORT_ENTRIES = 100_000;
export const MAX_FOLDER_DEPTH = 64;

export class InvalidImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImportFileError';
  }
}

export interface UploadedBookmarkFileInput {
  filename: string;
  content: string;
  sizeBytes?: number;
  sourceBrowserHint?: string | null;
}

export interface ReconciliationSummaryMetrics {
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
}

export interface ParseAndReconcileResult {
  entries: ReconciledImportEntry[];
  metrics: ReconciliationSummaryMetrics;
  detectedBrowser: string | null;
}

export function detectBrowserFromHtml(
  content: string,
  filename: string,
  hint?: string | null
): string {
  if (hint && hint.trim().length > 0 && hint.trim().toLowerCase() !== 'auto') {
    return hint.trim();
  }
  const lowerName = filename.toLowerCase();
  const sample = content.slice(0, 8192);

  if (lowerName.includes('opera') || /opera\s*gx|opera/i.test(sample)) {
    return 'Opera / Opera GX';
  }
  if (lowerName.includes('brave') || /brave/i.test(sample)) {
    return 'Brave';
  }
  if (lowerName.includes('edge') || /favorites\s+bar/i.test(sample)) {
    return 'Microsoft Edge';
  }
  if (
    lowerName.includes('firefox') ||
    /PERSONAL_TOOLBAR_FOLDER="true".*UNFILED_BOOKMARKS_FOLDER/is.test(sample) ||
    /placesRoot|toolbarFolder/i.test(sample)
  ) {
    return 'Mozilla Firefox';
  }
  if (
    lowerName.includes('chrome') ||
    /PERSONAL_TOOLBAR_FOLDER="true"/i.test(sample)
  ) {
    return 'Google Chrome';
  }
  return 'Netscape HTML Export';
}

export function validateBookmarkHtmlFile(file: UploadedBookmarkFileInput): void {
  const name = (file.filename || '').trim();
  if (!name) {
    throw new InvalidImportFileError('Uploaded file is missing a filename.');
  }

  if (!/\.html?$/i.test(name)) {
    throw new InvalidImportFileError(
      `Unsupported file extension in "${name}". Only .html and .htm Netscape bookmark files are accepted.`
    );
  }

  const byteLength =
    file.sizeBytes ?? Buffer.byteLength(file.content || '', 'utf-8');
  if (byteLength <= 0 || !file.content || file.content.trim().length === 0) {
    throw new InvalidImportFileError(`File "${name}" is empty.`);
  }

  if (byteLength > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new InvalidImportFileError(
      `File "${name}" exceeds the maximum allowed size of 25 MB.`
    );
  }

  // Reject binary payloads containing NUL bytes
  if (file.content.includes('\u0000')) {
    throw new InvalidImportFileError(
      `File "${name}" appears to be a binary file rather than a valid HTML bookmark export.`
    );
  }

  // Verify actual HTML bookmark structure (<A ... HREF=...> or <!DOCTYPE NETSCAPE-Bookmark-file-1> or <DL>)
  const hasNetscapeHeader = /NETSCAPE-Bookmark-file/i.test(file.content);
  const hasBookmarkStructure =
    /<dl[\s>]/i.test(file.content) || /<a\s+[^>]*href\s*=/i.test(file.content);

  if (!hasNetscapeHeader && !hasBookmarkStructure) {
    throw new InvalidImportFileError(
      `File "${name}" does not contain recognizable Netscape Bookmark HTML structure (<DL> or <A HREF="...">).`
    );
  }
}

function normalizeTimestampAttribute(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num) && num > 0) {
      // Browser exports usually store seconds since epoch, or occasionally microseconds/milliseconds
      const ms =
        trimmed.length <= 10
          ? num * 1000
          : trimmed.length <= 13
          ? num
          : Math.floor(num / 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }
  return trimmed;
}

function fallbackTitleFromRawInvalidUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return 'Untitled Invalid Link';
  return trimmed.slice(0, 80);
}

/**
 * Parses one or more Netscape Bookmark HTML files using htmlparser2 without executing
 * scripts or flattening nested folder hierarchies.
 */
export function parseNetscapeBookmarkFiles(
  files: UploadedBookmarkFileInput[]
): {
  occurrences: ParsedHtmlBookmarkOccurrence[];
  detectedBrowser: string | null;
} {
  if (!Array.isArray(files) || files.length === 0) {
    throw new InvalidImportFileError(
      'Please select at least one .html or .htm bookmark file to import.'
    );
  }

  const occurrences: ParsedHtmlBookmarkOccurrence[] = [];
  let globalOccurrenceIndex = 0;
  const detectedBrowsers = new Set<string>();

  for (const file of files) {
    validateBookmarkHtmlFile(file);
    const sourceBrowser = detectBrowserFromHtml(
      file.content,
      file.filename,
      file.sourceBrowserHint
    );
    detectedBrowsers.add(sourceBrowser);

    // Track folder hierarchy across <DL> and <H3>
    // In Netscape Bookmark HTML:
    // <DT><H3>Folder Name</H3>
    // <DL><p>
    //   <DT><A HREF="...">Bookmark</A>
    // </DL><p>
    const folderStack: string[] = [];
    // Track whether each <DL> pushed a folder onto folderStack
    const dlPushedFolderStack: boolean[] = [];
    let pendingFolderTitle: string | null = null;

    let inH3 = false;
    let currentH3Text = '';

    let inAnchor = false;
    let currentAnchorAttrs: Record<string, string> = {};
    let currentAnchorText = '';
    let currentAnchorFolderSnapshot: string[] = [];
    let fileSourceOrder = 0;

    const flushPendingAnchor = () => {
      if (!inAnchor) return;
      inAnchor = false;

      globalOccurrenceIndex += 1;
      fileSourceOrder += 1;

      if (globalOccurrenceIndex > MAX_IMPORT_ENTRIES) {
        throw new InvalidImportFileError(
          `Import exceeds the maximum limit of ${MAX_IMPORT_ENTRIES.toLocaleString()} bookmark entries.`
        );
      }

      const rawHref = (currentAnchorAttrs.href ?? '').trim();
      const rawTitle = currentAnchorText.replace(/\s+/g, ' ').trim();
      const hasMissingTitle = rawTitle.length === 0;
      const addDate = normalizeTimestampAttribute(currentAnchorAttrs.add_date);
      const lastModified = normalizeTimestampAttribute(
        currentAnchorAttrs.last_modified
      );

      const warnings: string[] = [];
      let normalizedUrlKey: string | null = null;
      let domain: string | null = null;
      let displayTitle = rawTitle;
      let invalidReason: string | null = null;

      if (currentAnchorFolderSnapshot.length > MAX_FOLDER_DEPTH) {
        warnings.push(
          `Folder depth exceeded ${MAX_FOLDER_DEPTH} levels and was truncated.`
        );
      }
      const boundedFolderPath = currentAnchorFolderSnapshot.slice(
        0,
        MAX_FOLDER_DEPTH
      );

      if (!rawHref) {
        invalidReason = 'Bookmark <A> tag is missing an HREF attribute.';
        warnings.push(invalidReason);
        if (hasMissingTitle) {
          displayTitle = 'Missing URL';
        }
      } else {
        try {
          const norm = normalizeBookmarkUrl(rawHref);
          normalizedUrlKey = norm.normalizedUrlKey;
          domain = norm.domain;
          if (hasMissingTitle) {
            displayTitle = norm.fallbackTitle;
            warnings.push(
              `Missing bookmark title in HTML; using fallback "${displayTitle}".`
            );
          }
        } catch (err) {
          invalidReason =
            err instanceof InvalidBookmarkUrlError
              ? err.message
              : 'Malformed or unsupported URL.';
          warnings.push(invalidReason);
          if (hasMissingTitle) {
            displayTitle = fallbackTitleFromRawInvalidUrl(rawHref);
          }
        }
      }

      occurrences.push({
        occurrenceIndex: globalOccurrenceIndex,
        sourceFilename: file.filename,
        sourceBrowser,
        sourceOrder: fileSourceOrder,
        originalUrl: rawHref,
        normalizedUrlKey,
        domain,
        originalTitle: rawTitle, // Empty string preserved if missing
        displayTitle,
        hasMissingTitle,
        folderPath: boundedFolderPath,
        addDate,
        lastModified,
        warnings,
        invalidReason,
      });

      currentAnchorAttrs = {};
      currentAnchorText = '';
    };

    const parser = new Parser(
      {
        onopentag(name, attribs) {
          const lower = name.toLowerCase();

          // In malformed Netscape HTML, a new <dt>, <h3>, <dl>, or <a> might open before </a> closes
          if (
            inAnchor &&
            (lower === 'a' || lower === 'dt' || lower === 'h3' || lower === 'dl')
          ) {
            flushPendingAnchor();
          }

          if (lower === 'h3') {
            inH3 = true;
            currentH3Text = '';
          } else if (lower === 'dl') {
            if (pendingFolderTitle !== null) {
              folderStack.push(pendingFolderTitle);
              dlPushedFolderStack.push(true);
              pendingFolderTitle = null;
            } else {
              dlPushedFolderStack.push(false);
            }
          } else if (lower === 'a') {
            inAnchor = true;
            const normalizedAttribs: Record<string, string> = {};
            for (const [k, v] of Object.entries(attribs)) {
              normalizedAttribs[k.toLowerCase()] = v;
            }
            currentAnchorAttrs = normalizedAttribs;
            currentAnchorText = '';
            currentAnchorFolderSnapshot = [...folderStack];
          }
        },
        ontext(text) {
          if (inH3) {
            currentH3Text += text;
          } else if (inAnchor) {
            currentAnchorText += text;
          }
        },
        onclosetag(name) {
          const lower = name.toLowerCase();
          if (lower === 'h3' && inH3) {
            inH3 = false;
            const folderName = currentH3Text.replace(/\s+/g, ' ').trim();
            pendingFolderTitle = folderName || 'Untitled Folder';
            currentH3Text = '';
          } else if (lower === 'a' && inAnchor) {
            flushPendingAnchor();
          } else if (lower === 'dl') {
            if (inAnchor) {
              flushPendingAnchor();
            }
            const pushed = dlPushedFolderStack.pop();
            if (pushed) {
              folderStack.pop();
            }
            pendingFolderTitle = null;
          }
        },
      },
      {
        decodeEntities: true,
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
        recognizeSelfClosing: true,
      }
    );

    parser.write(file.content);
    parser.end();

    if (inAnchor) {
      flushPendingAnchor();
    }
  }

  if (occurrences.length === 0) {
    throw new InvalidImportFileError(
      'No bookmark <A HREF="..."> entries were found in the uploaded HTML file(s).'
    );
  }

  const detectedBrowser =
    detectedBrowsers.size === 1
      ? Array.from(detectedBrowsers)[0]
      : `Multiple (${Array.from(detectedBrowsers).join(', ')})`;

  return {
    occurrences,
    detectedBrowser,
  };
}

/**
 * Reconciles parsed bookmark occurrences against:
 * 1. Earlier occurrences in the same upload batch (by normalized full URL)
 * 2. Existing canonical bookmarks in the owner's PostgreSQL database (by normalized full URL)
 * 3. Category conflicts when a destination category is chosen or existing bookmark has a different category
 */
export function reconcileBookmarkOccurrences(
  occurrences: ParsedHtmlBookmarkOccurrence[],
  existingBookmarks: BookmarkRecord[],
  destinationCategoryId: string | null,
  filesCount = 1
): {
  entries: ReconciledImportEntry[];
  metrics: ReconciliationSummaryMetrics;
} {
  const existingByNormalizedKey = new Map<string, BookmarkRecord>();
  for (const bm of existingBookmarks) {
    existingByNormalizedKey.set(bm.normalizedUrlKey, bm);
  }

  const seenInUpload = new Set<string>();
  const uniqueUploadIdentitiesSet = new Set<string>();

  let withinUploadDuplicates = 0;
  let existingDbDuplicates = 0;
  let newCanonicalBookmarks = 0;
  let invalidRecords = 0;
  let missingTitlesCount = 0;
  let categoryConflictsCount = 0;
  let warningCount = 0;

  const reconciled: ReconciledImportEntry[] = occurrences.map((occ) => {
    if (occ.hasMissingTitle) {
      missingTitlesCount += 1;
    }

    const entryWarnings = [...occ.warnings];

    if (occ.invalidReason || !occ.normalizedUrlKey) {
      invalidRecords += 1;
      warningCount += entryWarnings.length;
      return {
        ...occ,
        warnings: entryWarnings,
        status: 'invalid',
        existingBookmarkId: null,
        existingBookmarkTitle: null,
        existingCategoryId: null,
        existingCategoryLabel: null,
        existingCategoryLocked: false,
        hasCategoryConflict: false,
      };
    }

    uniqueUploadIdentitiesSet.add(occ.normalizedUrlKey);

    if (seenInUpload.has(occ.normalizedUrlKey)) {
      withinUploadDuplicates += 1;
      entryWarnings.push(
        'Duplicate full URL within the same import batch; canonical bookmark will not be duplicated.'
      );
      warningCount += entryWarnings.length;
      const existingBm = existingByNormalizedKey.get(occ.normalizedUrlKey) ?? null;
      const existingCategoryLabel = existingBm
        ? existingBm.parentCategoryName && existingBm.primaryCategoryName
          ? `${existingBm.parentCategoryName} / ${existingBm.primaryCategoryName}`
          : existingBm.primaryCategoryName ?? 'Uncategorized'
        : null;

      return {
        ...occ,
        warnings: entryWarnings,
        status: 'duplicate_in_upload',
        existingBookmarkId: existingBm ? existingBm.id : null,
        existingBookmarkTitle: existingBm ? existingBm.title : null,
        existingCategoryId: existingBm ? existingBm.primaryCategoryId : null,
        existingCategoryLabel,
        existingCategoryLocked: existingBm ? existingBm.categoryLocked : false,
        hasCategoryConflict: false,
      };
    }

    seenInUpload.add(occ.normalizedUrlKey);

    const existingBm = existingByNormalizedKey.get(occ.normalizedUrlKey);
    if (existingBm) {
      existingDbDuplicates += 1;
      const existingCategoryLabel =
        existingBm.parentCategoryName && existingBm.primaryCategoryName
          ? `${existingBm.parentCategoryName} / ${existingBm.primaryCategoryName}`
          : existingBm.primaryCategoryName ?? 'Uncategorized';

      // A category conflict occurs if a destination category is selected and differs from the existing bookmark's category
      const hasCategoryConflict = Boolean(
        destinationCategoryId &&
          existingBm.primaryCategoryId !== destinationCategoryId
      );

      if (hasCategoryConflict) {
        categoryConflictsCount += 1;
        entryWarnings.push(
          existingBm.categoryLocked
            ? `Existing bookmark is manually locked to "${existingCategoryLabel}".`
            : `Existing bookmark is currently assigned to "${existingCategoryLabel}".`
        );
      }

      warningCount += entryWarnings.length;

      return {
        ...occ,
        warnings: entryWarnings,
        status: hasCategoryConflict ? 'category_conflict' : 'duplicate_in_db',
        existingBookmarkId: existingBm.id,
        existingBookmarkTitle: existingBm.title,
        existingCategoryId: existingBm.primaryCategoryId,
        existingCategoryLabel,
        existingCategoryLocked: existingBm.categoryLocked,
        hasCategoryConflict,
      };
    }

    newCanonicalBookmarks += 1;
    warningCount += entryWarnings.length;

    return {
      ...occ,
      warnings: entryWarnings,
      status: 'new',
      existingBookmarkId: null,
      existingBookmarkTitle: null,
      existingCategoryId: null,
      existingCategoryLabel: null,
      existingCategoryLocked: false,
      hasCategoryConflict: false,
    };
  });

  const exactDuplicates = withinUploadDuplicates + existingDbDuplicates;

  return {
    entries: reconciled,
    metrics: {
      filesCount,
      totalParsedEntries: occurrences.length,
      uniqueUploadIdentities: uniqueUploadIdentitiesSet.size,
      withinUploadDuplicates,
      existingDbDuplicates,
      newCanonicalBookmarks,
      exactDuplicates,
      invalidRecords,
      missingTitlesCount,
      categoryConflictsCount,
      warningCount,
    },
  };
}
