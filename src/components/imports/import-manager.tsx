'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  FolderTree,
  History,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CategoryWithChildren,
  ImportConflictStrategy,
  ImportEntryStatus,
  ImportJobRecord,
  ImportOccurrenceRecord,
  ImportPreviewResponse,
  ReconciledImportEntry,
} from '@/types/bookmark';
import { Button } from '@/components/ui/button';

interface SelectedUploadFile {
  filename: string;
  content: string;
  sizeBytes: number;
}

interface CommitBreakdown {
  insertedCanonicalCount: number;
  withinUploadDuplicatesSkipped: number;
  existingDuplicatesKept: number;
  existingMovedToDestination: number;
  secondaryPlacementsAdded: number;
  invalidEntriesSkipped: number;
}

interface ImportManagerProps {
  categoriesTree: CategoryWithChildren[];
  onImportCompleted: () => Promise<void>;
  onNavigateToBookmarks: (categoryId?: string | null) => void;
}

const SAMPLE_NETSCAPE_BOOKMARKS_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1710000000" LAST_MODIFIED="1710000100" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1710000200">Cloud &amp; Backend Engineering</H3>
        <DL><p>
            <DT><A HREF="https://orm.drizzle.team/docs/overview" ADD_DATE="1710000300">Drizzle ORM PostgreSQL Documentation</A>
            <DT><A HREF="https://orm.drizzle.team/docs/sql-schema-declaration" ADD_DATE="1710000350">Drizzle Schema Declaration Reference</A>
            <DT><A HREF="https://www.postgresql.org/docs/current/indexes-unique.html" ADD_DATE="1710000400">PostgreSQL Unique Indexes &amp; Constraints</A>
            <DT><A HREF="https://developer.mozilla.org/en-US/docs/Web/API/URL" ADD_DATE="1710000450"></A>
        </DL><p>
        <DT><H3 ADD_DATE="1710000500">Video Tutorials</H3>
        <DL><p>
            <DT><A HREF="https://youtube.com/watch?v=pg_indexing_101" ADD_DATE="1710000550">PostgreSQL Indexing Deep Dive</A>
            <DT><A HREF="https://youtube.com/watch?v=nextjs_app_router" ADD_DATE="1710000600">Next.js App Router Server Actions</A>
            <DT><A HREF="https://YOUTUBE.COM/watch?v=pg_indexing_101" ADD_DATE="1710000650">PostgreSQL Indexing Deep Dive (Toolbar Copy)</A>
        </DL><p>
        <DT><A HREF="javascript:void(0)" ADD_DATE="1710000700">Legacy Browser Bookmarklet</A>
    </DL><p>
</DL><p>`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateShort(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function formatStatusLabel(entry: ReconciledImportEntry): string {
  switch (entry.status) {
    case 'new':
      return 'New canonical bookmark';
    case 'duplicate_in_upload':
      return 'Duplicate within upload';
    case 'duplicate_in_db':
      return entry.existingCategoryLabel
        ? `Exists in vault · ${entry.existingCategoryLabel}`
        : 'Exists in vault';
    case 'category_conflict':
      return entry.existingCategoryLocked
        ? `Conflict · Locked to ${entry.existingCategoryLabel || 'Category'}`
        : `Conflict · In ${entry.existingCategoryLabel || 'Category'}`;
    case 'invalid':
      return `Invalid · ${entry.invalidReason || 'Skipped'}`;
    default:
      return entry.status;
  }
}

function formatResolutionLabel(status: string): string {
  switch (status) {
    case 'inserted_new':
      return 'Inserted as new canonical bookmark';
    case 'duplicate_in_upload':
      return 'Skipped (duplicate within upload batch)';
    case 'duplicate_kept_existing':
      return 'Existing canonical bookmark kept';
    case 'duplicate_kept_manual_lock':
      return 'Existing manual category lock preserved';
    case 'duplicate_moved_to_selected':
      return 'Moved existing bookmark to destination category';
    case 'duplicate_secondary_placement_added':
      return 'Added secondary placement reference';
    case 'invalid_skipped':
      return 'Invalid URL skipped';
    default:
      return status;
  }
}

export function ImportManager({
  categoriesTree,
  onImportCompleted,
  onNavigateToBookmarks,
}: ImportManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<SelectedUploadFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [sourceBrowserHint, setSourceBrowserHint] = useState<string>('auto');
  const [destinationCategoryId, setDestinationCategoryId] =
    useState<string>('');
  const [conflictStrategy, setConflictStrategy] =
    useState<ImportConflictStrategy>('keep_existing');
  const [confirmOverrideManualLocks, setConfirmOverrideManualLocks] =
    useState(false);

  const [previewState, setPreviewState] =
    useState<ImportPreviewResponse | null>(null);
  const [entryFilter, setEntryFilter] = useState<'all' | ImportEntryStatus>(
    'all'
  );

  const [committedResult, setCommittedResult] = useState<{
    job: ImportJobRecord;
    resolutionBreakdown: CommitBreakdown;
  } | null>(null);

  const [historyJobs, setHistoryJobs] = useState<ImportJobRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [inspectedJobDetails, setInspectedJobDetails] = useState<{
    job: ImportJobRecord;
    occurrences: ImportOccurrenceRecord[];
    resolutionBreakdown: CommitBreakdown;
  } | null>(null);
  const [inspectingJobId, setInspectingJobId] = useState<string | null>(null);

  const [submittingPreview, setSubmittingPreview] = useState(false);
  const [submittingCommit, setSubmittingCommit] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadImportHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/v1/imports');
      if (res.ok) {
        const data = await res.json();
        setHistoryJobs(data.jobs || []);
      }
    } catch {
      // Non-fatal history fetch error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImportHistory();
  }, [loadImportHistory]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);

    const additions: SelectedUploadFile[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList[i];
      if (!/\.html?$/i.test(file.name)) {
        setErrorMessage(
          `Unsupported file "${file.name}". Only Netscape Bookmark .html and .htm exports are allowed.`
        );
        return;
      }
      const text = await file.text();
      additions.push({
        filename: file.name,
        content: text,
        sizeBytes: file.size,
      });
    }

    setSelectedFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.filename, f]));
      for (const item of additions) {
        byName.set(item.filename, item);
      }
      return Array.from(byName.values());
    });
    setPreviewState(null);
    setCommittedResult(null);
  };

  const handleLoadSampleExport = () => {
    setErrorMessage(null);
    const bytes = new Blob([SAMPLE_NETSCAPE_BOOKMARKS_HTML]).size;
    setSelectedFiles([
      {
        filename: 'chrome_bookmarks_export_2026.html',
        content: SAMPLE_NETSCAPE_BOOKMARKS_HTML,
        sizeBytes: bytes,
      },
    ]);
    setPreviewState(null);
    setCommittedResult(null);
  };

  const handleRemoveFile = (filename: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.filename !== filename));
    setPreviewState(null);
  };

  const handleGeneratePreview = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage(
        'Please select at least one .html or .htm bookmark file first.'
      );
      return;
    }

    setSubmittingPreview(true);
    setErrorMessage(null);
    setCommittedResult(null);

    try {
      const res = await fetch('/api/v1/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles,
          destinationCategoryId: destinationCategoryId || null,
          conflictStrategy,
          sourceBrowserHint:
            sourceBrowserHint === 'auto' ? null : sourceBrowserHint,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(
          data.error || 'Failed to parse and preview the bookmark HTML file.'
        );
        return;
      }

      setPreviewState(data as ImportPreviewResponse);
      setEntryFilter('all');
      await loadImportHistory();
      setTimeout(() => {
        document
          .getElementById('import-preview-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch {
      setErrorMessage('Network error while generating bookmark import preview.');
    } finally {
      setSubmittingPreview(false);
    }
  };

  const handleConfirmCommit = async () => {
    if (!previewState) return;
    setSubmittingCommit(true);
    setErrorMessage(null);

    try {
      const idempotencyKey = `commit_${previewState.job.id}_${previewState.previewToken.slice(0, 12)}`;
      const res = await fetch(`/api/v1/imports/${previewState.job.id}/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          previewToken: previewState.previewToken,
          idempotencyKey,
          destinationCategoryId: destinationCategoryId || null,
          conflictStrategy,
          confirmOverrideManualLocks,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to commit bookmark import.');
        return;
      }

      setCommittedResult({
        job: data.job,
        resolutionBreakdown: data.resolutionBreakdown,
      });
      setPreviewState(null);
      setSelectedFiles([]);
      await Promise.all([loadImportHistory(), onImportCompleted()]);
    } catch {
      setErrorMessage('Network error while committing bookmark import.');
    } finally {
      setSubmittingCommit(false);
    }
  };

  const handleInspectJob = async (jobId: string) => {
    if (inspectedJobDetails?.job.id === jobId) {
      setInspectedJobDetails(null);
      return;
    }

    setInspectingJobId(jobId);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/imports/${jobId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to load import job occurrences.');
        return;
      }
      setInspectedJobDetails(data);
      setTimeout(() => {
        document
          .getElementById('import-history-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch {
      setErrorMessage('Failed to load import job details.');
    } finally {
      setInspectingJobId(null);
    }
  };

  const filteredPreviewEntries = useMemo(() => {
    if (!previewState) return [];
    if (entryFilter === 'all') return previewState.sampleEntries;
    return previewState.sampleEntries.filter((e) => e.status === entryFilter);
  }, [previewState, entryFilter]);

  const hasLockedConflictsInPreview = useMemo(() => {
    if (!previewState) return false;
    return previewState.sampleEntries.some(
      (e) => e.existingCategoryLocked && e.existingBookmarkId !== null
    );
  }, [previewState]);

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div
          role="alert"
          data-testid="import-error-alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-medium text-red-700 hover:text-red-900 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stage 3: Committed Import Results */}
      {committedResult && (
        <section
          aria-label="Import Results Summary"
          data-testid="import-completed-banner"
          className="rounded-xl border border-emerald-200 bg-white p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Import Completed: {committedResult.job.originalFilename}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Source: {committedResult.job.sourceBrowser || 'Netscape HTML'}{' '}
                  · Destination:{' '}
                  {committedResult.job.destinationCategoryLabel ||
                    'Uncategorized'}{' '}
                  · Full-URL Identity Normalization (
                  {committedResult.job.normalizationVersion})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleInspectJob(committedResult.job.id)}
              >
                Inspect Provenance
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  onNavigateToBookmarks(
                    committedResult.job.destinationCategoryId
                  )
                }
              >
                Open Imported Bookmarks
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">New Bookmarks Added</p>
              <p
                data-testid="result-inserted-count"
                className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700"
              >
                {committedResult.resolutionBreakdown.insertedCanonicalCount}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">Upload Duplicates</p>
              <p
                data-testid="result-upload-dups-count"
                className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900"
              >
                {
                  committedResult.resolutionBreakdown
                    .withinUploadDuplicatesSkipped
                }
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">Existing Kept</p>
              <p
                data-testid="result-existing-kept-count"
                className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900"
              >
                {committedResult.resolutionBreakdown.existingDuplicatesKept}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">Moved to Category</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
                {committedResult.resolutionBreakdown.existingMovedToDestination}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">Secondary Placements</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
                {committedResult.resolutionBreakdown.secondaryPlacementsAdded}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-xs text-slate-500">Invalid Skipped</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-700">
                {committedResult.resolutionBreakdown.invalidEntriesSkipped}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Stage 1: Upload & Configuration Panel */}
      <section
        aria-label="Upload Netscape Bookmark HTML Files"
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              1. Select Browser Bookmark HTML Files
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Supports Netscape Bookmark exports (.html, .htm) from Chrome,
              Edge, Opera / Opera GX, Brave, and Firefox. Preview is required
              before any canonical bookmarks are inserted.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLoadSampleExport}
            data-testid="load-sample-html-btn"
          >
            <FileCode2 className="h-4 w-4" />
            Load Sample Browser Export (.html)
          </Button>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void handleFilesSelected(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragActive
              ? 'border-slate-900 bg-slate-100/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            multiple
            onChange={(e) => void handleFilesSelected(e.target.files)}
            className="sr-only"
            id="bookmark-html-file-input"
            data-testid="bookmark-html-file-input"
          />
          <Upload className="h-7 w-7 text-slate-400 mx-auto" />
          <p className="mt-3 text-sm font-medium text-slate-900">
            Drag and drop browser bookmark HTML files here
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Accepts single or multiple .html / .htm files (up to 25 MB per file)
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse .html Files
            </Button>
          </div>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Selected Files ({selectedFiles.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFiles([]);
                  setPreviewState(null);
                }}
                className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
              >
                Clear All
              </button>
            </div>

            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/50">
              {selectedFiles.map((file) => (
                <div
                  key={file.filename}
                  className="flex items-center justify-between px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCode2 className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="font-medium text-slate-900 truncate">
                      {file.filename}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500 tabular-nums shrink-0">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.filename)}
                    aria-label={`Remove ${file.filename}`}
                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Options: Source Browser, Destination Category, Conflict Strategy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <label
              htmlFor="import-browser-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Source Browser Metadata
            </label>
            <select
              id="import-browser-select"
              value={sourceBrowserHint}
              onChange={(e) => setSourceBrowserHint(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="auto">Auto-Detect from HTML Structure</option>
              <option value="Google Chrome">Google Chrome</option>
              <option value="Microsoft Edge">Microsoft Edge</option>
              <option value="Opera / Opera GX">Opera / Opera GX</option>
              <option value="Brave">Brave</option>
              <option value="Mozilla Firefox">Mozilla Firefox</option>
            </select>
            <p className="text-[11px] text-slate-500">
              Recorded in import provenance without altering canonical URLs.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="import-destination-category"
              className="block text-xs font-semibold text-slate-700"
            >
              Destination Category (Optional)
            </label>
            <select
              id="import-destination-category"
              data-testid="import-destination-category"
              value={destinationCategoryId}
              onChange={(e) => setDestinationCategoryId(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="">Leave Uncategorized (Default)</option>
              {categoriesTree.map((main) => (
                <React.Fragment key={main.id}>
                  <option value={main.id}>{main.name}</option>
                  {main.subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      &nbsp;&nbsp;↳ {main.name} / {sub.name}
                    </option>
                  ))}
                </React.Fragment>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Browser folders (Bookmarks bar, etc.) are saved as metadata only,
              never auto-created as categories.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="import-conflict-strategy"
              className="block text-xs font-semibold text-slate-700"
            >
              Existing Bookmark Category Conflict Rule
            </label>
            <select
              id="import-conflict-strategy"
              data-testid="import-conflict-strategy"
              value={conflictStrategy}
              onChange={(e) =>
                setConflictStrategy(e.target.value as ImportConflictStrategy)
              }
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="keep_existing">
                Keep Existing Category (Recommended Default)
              </option>
              <option value="add_secondary_placement">
                Add Secondary Category Placement Reference
              </option>
              <option value="move_to_selected">
                Move Existing Bookmark to Selected Category
              </option>
            </select>
            <p className="text-[11px] text-slate-500">
              Controls how already-saved URLs behave when a destination category
              is chosen.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            onClick={() => void handleGeneratePreview()}
            disabled={selectedFiles.length === 0 || submittingPreview}
            data-testid="generate-preview-btn"
          >
            {submittingPreview ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing & Reconciling Full URLs...
              </>
            ) : (
              <>
                <FileCode2 className="h-4 w-4" />
                Generate Import Preview
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Stage 2: Staged Import Preview & Conflict Resolution */}
      {previewState && (
        <section
          id="import-preview-section"
          aria-label="Staged Import Preview"
          data-testid="import-preview-panel"
          className="rounded-xl border border-slate-300 bg-white p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <span>STAGED PREVIEW — NO BOOKMARKS INSERTED YET</span>
                <span>·</span>
                <span className="font-mono">
                  SHA-256: {previewState.job.fileHash.slice(0, 12)}…
                </span>
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 mt-1">
                2. Review Reconciled Entries & Confirm Import
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                File(s): {previewState.selectedFilenames.join(', ')} · Detected
                Source: {previewState.job.sourceBrowser}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewState(null)}
              >
                <X className="h-4 w-4" />
                Cancel Preview
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleConfirmCommit()}
                disabled={submittingCommit}
                data-testid="confirm-import-btn"
              >
                {submittingCommit ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Committing Batch...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm & Import ({previewState.job.newCanonicalBookmarks}{' '}
                    New)
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 8-Metric Reconciliation Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Files</p>
              <p
                data-testid="preview-files-count"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.filesCount}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Parsed Links</p>
              <p
                data-testid="preview-total-parsed"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.totalParsedEntries}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Unique Full URLs</p>
              <p
                data-testid="preview-unique-urls"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.uniqueUploadIdentities}
              </p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-[11px] text-emerald-800 font-medium">
                New Bookmarks
              </p>
              <p
                data-testid="preview-new-bookmarks"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-700"
              >
                {previewState.job.newCanonicalBookmarks}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Upload Dups</p>
              <p
                data-testid="preview-upload-dups"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.withinUploadDuplicates}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Already in DB</p>
              <p
                data-testid="preview-db-dups"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.existingDbDuplicates}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">Category Conflicts</p>
              <p
                data-testid="preview-category-conflicts"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900"
              >
                {previewState.job.categoryConflictsCount}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] text-slate-500">
                Invalid / Empty Title
              </p>
              <p
                data-testid="preview-invalid-count"
                className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-700"
              >
                {previewState.job.invalidRecords} /{' '}
                {previewState.job.missingTitlesCount}
              </p>
            </div>
          </div>

          {/* Explicit Manual Lock Protection Notice when Move to Selected is active */}
          {conflictStrategy === 'move_to_selected' &&
            destinationCategoryId &&
            hasLockedConflictsInPreview && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    Manual Category Lock Protection Active on Existing Bookmarks
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  One or more duplicate URLs in this file are already saved in
                  your vault with a manual category lock. By default, locked
                  bookmarks keep their existing category unless you explicitly
                  confirm overriding manual locks below.
                </p>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-900 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmOverrideManualLocks}
                    onChange={(e) =>
                      setConfirmOverrideManualLocks(e.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    Explicitly override existing manual category locks and move
                    matching bookmarks to the selected destination category
                  </span>
                </label>
              </div>
            )}

          {/* Filter Tabs for Sample Preview Table */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Filter preview entries"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  {
                    id: 'all',
                    label: `All (${previewState.sampleEntries.length})`,
                  },
                  {
                    id: 'new',
                    label: `New (${previewState.job.newCanonicalBookmarks})`,
                  },
                  {
                    id: 'duplicate_in_upload',
                    label: `Upload Dups (${previewState.job.withinUploadDuplicates})`,
                  },
                  {
                    id: 'duplicate_in_db',
                    label: `In Vault (${
                      previewState.job.existingDbDuplicates -
                      previewState.job.categoryConflictsCount
                    })`,
                  },
                  {
                    id: 'category_conflict',
                    label: `Category Conflicts (${previewState.job.categoryConflictsCount})`,
                  },
                  {
                    id: 'invalid',
                    label: `Invalid (${previewState.job.invalidRecords})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEntryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    entryFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              Showing {filteredPreviewEntries.length} of{' '}
              {previewState.totalSampleCount} parsed occurrences
            </p>
          </div>

          {/* Reconciled Occurrences Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Title & Normalized Full URL</th>
                  <th className="py-3 px-4">Browser Folder Path</th>
                  <th className="py-3 px-4">Reconciliation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs bg-white">
                {filteredPreviewEntries.map((entry) => (
                  <tr
                    key={entry.occurrenceIndex}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-slate-500 tabular-nums align-top whitespace-nowrap">
                      #{entry.occurrenceIndex}
                    </td>
                    <td className="py-3 px-4 align-top max-w-md">
                      <div className="font-medium text-slate-900 break-words">
                        {entry.displayTitle}
                        {entry.hasMissingTitle && (
                          <span className="ml-2 text-[11px] font-normal text-amber-700">
                            · Fallback title (empty HTML title preserved)
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 break-all mt-0.5">
                        {entry.normalizedUrlKey || entry.originalUrl}
                      </div>
                      {entry.warnings.length > 0 && (
                        <div className="text-[11px] text-amber-700 mt-1">
                          {entry.warnings.join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top text-slate-600">
                      {entry.folderPath.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-700">
                          <FolderTree className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{entry.folderPath.join(' / ')}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Root</span>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          entry.status === 'new'
                            ? 'text-emerald-700'
                            : entry.status === 'invalid'
                            ? 'text-red-700'
                            : entry.status === 'category_conflict'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatStatusLabel(entry)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Import History & Provenance Section */}
      <section
        id="import-history-section"
        aria-label="Import History"
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-slate-700" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Import History & Provenance Log
              </h2>
              <p className="text-xs text-slate-500">
                Every preview and completed HTML import job with preserved
                browser folder hierarchy (`import_occurrences`).
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadImportHistory()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {historyLoading ? (
          <div className="h-24 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />
        ) : historyJobs.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-8 text-center">
            <p className="text-sm font-medium text-slate-800">
              No bookmark imports recorded yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Upload a Netscape Bookmark HTML file or load the sample export
              above to preview and commit your first import.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">File & Source</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Destination</th>
                  <th className="py-2.5 px-3 text-right">Parsed</th>
                  <th className="py-2.5 px-3 text-right">Added</th>
                  <th className="py-2.5 px-3 text-right">Dups</th>
                  <th className="py-2.5 px-3 text-right">Invalid</th>
                  <th className="py-2.5 px-3 text-right">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs bg-white">
                {historyJobs.map((job) => (
                  <React.Fragment key={job.id}>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900 max-w-[220px]">
                        <div className="truncate" title={job.originalFilename}>
                          {job.originalFilename}
                        </div>
                        <div className="text-[11px] font-normal text-slate-500 truncate">
                          {job.sourceBrowser || 'Netscape HTML'} ·{' '}
                          {job.filesCount}{' '}
                          {job.filesCount === 1 ? 'file' : 'files'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateShort(job.completedAt || job.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            job.status === 'completed'
                              ? 'text-emerald-700'
                              : job.status === 'preview'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {job.status === 'completed'
                            ? 'Completed'
                            : job.status === 'preview'
                            ? 'Preview Only'
                            : job.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {job.destinationCategoryLabel || 'Uncategorized'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {job.totalParsedEntries}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {job.newCanonicalBookmarks}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {job.exactDuplicates}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                        {job.invalidRecords}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {job.status === 'completed' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleInspectJob(job.id)}
                            disabled={inspectingJobId === job.id}
                            data-testid={`inspect-job-${job.id}`}
                          >
                            {inspectedJobDetails?.job.id === job.id
                              ? 'Hide'
                              : 'Occurrences'}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Staged
                          </span>
                        )}
                      </td>
                    </tr>

                    {inspectedJobDetails?.job.id === job.id && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50/90 p-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="font-display text-xs font-semibold text-slate-900">
                                Recorded Import Occurrences (
                                {inspectedJobDetails.occurrences.length}) —
                                Preserved Folder Provenance
                              </h3>
                              <span className="font-mono text-[11px] text-slate-500">
                                Job ID: {job.id}
                              </span>
                            </div>

                            <div className="overflow-x-auto max-h-80">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                                    <th className="py-2 px-3">#</th>
                                    <th className="py-2 px-3">
                                      Original / Fallback Title
                                    </th>
                                    <th className="py-2 px-3">Full URL</th>
                                    <th className="py-2 px-3">
                                      Preserved Folder Path
                                    </th>
                                    <th className="py-2 px-3">Outcome</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {inspectedJobDetails.occurrences.map(
                                    (occ) => (
                                      <tr key={occ.id}>
                                        <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">
                                          #{occ.occurrenceIndex}
                                        </td>
                                        <td className="py-2 px-3 text-slate-900">
                                          {occ.originalTitle || (
                                            <span className="text-amber-700">
                                              {occ.displayTitle} (empty HTML
                                              title)
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600 break-all">
                                          {occ.normalizedUrlKey ||
                                            occ.originalUrl}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600">
                                          {occ.folderPath.length > 0
                                            ? occ.folderPath.join(' / ')
                                            : 'Root'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700">
                                          {formatResolutionLabel(
                                            occ.resolutionStatus
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
