'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FolderTree,
  Lock,
  Play,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  CategoryWithChildren,
  ClassificationOverviewStats,
  ClassificationRuleType,
  ReviewQueueItemRecord,
} from '@/types/bookmark';
import type { BatchClassificationPreviewSummary } from '@/lib/classification/classification-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ReviewQueueManagerProps {
  categoriesTree: CategoryWithChildren[];
  onRefreshWorkspace: () => Promise<void>;
  onNavigateToRules: () => void;
}

export function ReviewQueueManager({
  categoriesTree,
  onRefreshWorkspace,
  onNavigateToRules,
}: ReviewQueueManagerProps) {
  const [statusFilter, setStatusFilter] = useState<
    'pending' | 'resolved' | 'dismissed' | 'all'
  >('pending');
  const [items, setItems] = useState<ReviewQueueItemRecord[]>([]);
  const [stats, setStats] = useState<ClassificationOverviewStats>({
    pendingReviewCount: 0,
    autoClassifiedCount: 0,
    manuallyCategorizedCount: 0,
    uncategorizedCount: 0,
    totalRulesCount: 0,
    ownerRulesCount: 0,
    mainCategoriesCount: 18,
    subcategoriesCount: 83,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Batch preview & apply state ("Classify Uncategorized Bookmarks")
  const [includeAutoInBatch, setIncludeAutoInBatch] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [batchPreview, setBatchPreview] =
    useState<BatchClassificationPreviewSummary | null>(null);

  // Per-item "Choose Another Category" + Option A / Option B modal state
  const [activeChooseItem, setActiveChooseItem] =
    useState<ReviewQueueItemRecord | null>(null);
  const [selectedMainId, setSelectedMainId] = useState('');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [ruleOptionMode, setRuleOptionMode] = useState<
    'only_this' | 'create_rule'
  >('only_this');
  const [ruleScopeType, setRuleScopeType] =
    useState<ClassificationRuleType>('hostname');
  const [rulePattern, setRulePattern] = useState('');
  const [applyRuleToUnlocked, setApplyRuleToUnlocked] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadReviewQueue = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/classification/review?status=${statusFilter}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load review queue.');
      }
      setItems(data.items || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load classification review queue.'
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadReviewQueue();
  }, [loadReviewQueue]);

  const handlePreviewBatch = async () => {
    setPreviewLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/v1/classification/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'batch',
          includeAutoCategorized: includeAutoInBatch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to preview batch classification.');
      }
      setBatchPreview(data.preview);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to preview batch classification.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmApplyBatch = async () => {
    setApplyingBatch(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/classification/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeAutoCategorized: includeAutoInBatch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply batch classification.');
      }
      const o = data.outcome;
      setActionMessage(
        `Evaluated ${o.evaluatedCount} bookmarks: ${o.autoClassifiedCount} auto-classified (>=90% confidence), ${o.suggestedForReviewCount} suggested for review, ${o.needsReviewCount} queued as low-confidence, ${o.skippedManualLocksCount} manual locks preserved.`
      );
      setBatchPreview(null);
      await loadReviewQueue();
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to apply batch classification.'
      );
    } finally {
      setApplyingBatch(false);
    }
  };

  const handleQuickResolve = async (
    item: ReviewQueueItemRecord,
    action: 'accept_suggestion' | 'keep_uncategorized' | 'dismiss'
  ) => {
    setResolvingId(item.bookmarkId);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/v1/classification/review/${item.bookmarkId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resolve review item.');
      }
      setActionMessage(
        action === 'accept_suggestion'
          ? `Accepted suggestion for "${item.bookmarkTitle}" and applied manual lock.`
          : action === 'keep_uncategorized'
          ? `Kept "${item.bookmarkTitle}" uncategorized and marked resolved.`
          : `Dismissed "${item.bookmarkTitle}" from active review queue.`
      );
      await loadReviewQueue();
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to resolve review item.'
      );
    } finally {
      setResolvingId(null);
    }
  };

  const openChooseModal = (item: ReviewQueueItemRecord) => {
    setActiveChooseItem(item);
    setSelectedMainId(item.suggestedCategoryId || '');
    setSelectedSubId(item.suggestedSubcategoryId || '');
    setRuleOptionMode('only_this');
    setRuleScopeType('hostname');
    setRulePattern(item.bookmarkDomain);
    setApplyRuleToUnlocked(true);
  };

  const deriveDefaultPatternForScope = (
    item: ReviewQueueItemRecord,
    scope: ClassificationRuleType
  ): string => {
    if (scope === 'exact_url') {
      return item.bookmarkUrl;
    }
    if (scope === 'path_prefix') {
      try {
        const parsed = new URL(item.bookmarkUrl);
        const segs = parsed.pathname.split('/').filter(Boolean);
        const prefixPath = segs.length > 0 ? `/${segs[0]}` : '/';
        return `${parsed.hostname.toLowerCase()}${prefixPath}`;
      } catch {
        return item.bookmarkDomain;
      }
    }
    if (scope === 'folder_mapping') {
      const firstPath = item.sourceFolderPath;
      return firstPath && firstPath.length > 0
        ? firstPath[firstPath.length - 1]
        : item.bookmarkDomain;
    }
    if (scope === 'title_keyword') {
      const words = item.bookmarkTitle
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 2)
        .join(' ');
      return words || item.bookmarkTitle;
    }
    return item.bookmarkDomain;
  };

  const handleConfirmChooseModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChooseItem) return;

    const effectiveCatId = selectedSubId || selectedMainId;
    if (!effectiveCatId) {
      setError('Please select a category or subcategory.');
      return;
    }

    setResolvingId(activeChooseItem.bookmarkId);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/classification/review/${activeChooseItem.bookmarkId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'choose_category',
            categoryId: effectiveCatId,
            createReusableRule:
              ruleOptionMode === 'create_rule' && rulePattern.trim()
                ? {
                    ruleType: ruleScopeType,
                    pattern: rulePattern.trim(),
                    applyToMatchingUnlocked: applyRuleToUnlocked,
                  }
                : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save category decision.');
      }

      const extraMsg = data.result?.createdRule
        ? ` Also created reusable ${data.result.createdRule.ruleType} rule "${data.result.createdRule.pattern}".`
        : '';
      setActionMessage(
        `Assigned manual locked category to "${activeChooseItem.bookmarkTitle}".${extraMsg}`
      );
      setActiveChooseItem(null);
      await loadReviewQueue();
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save category decision.'
      );
    } finally {
      setResolvingId(null);
    }
  };

  const availableSubcategories =
    categoriesTree.find((c) => c.id === selectedMainId)?.subcategories ?? [];

  return (
    <div className="space-y-8">
      {/* Overview Metrics Strip */}
      <section
        aria-label="Classification Overview Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Taxonomy Seed Status
          </p>
          <p
            data-testid="metric-taxonomy-counts"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
          >
            {stats.mainCategoriesCount} / {stats.subcategoriesCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Main categories / Subcategories
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Pending Manual Review
          </p>
          <p
            data-testid="metric-pending-review"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
          >
            {stats.pendingReviewCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Medium or low confidence items
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Auto-Categorized Bookmarks
          </p>
          <p
            data-testid="metric-auto-classified"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
          >
            {stats.autoClassifiedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            High-confidence (&ge; 90%) rule matches
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Manual Priority Locks
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {stats.manuallyCategorizedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> Never overridden by rules
          </p>
        </div>
      </section>

      {/* Classify Uncategorized Bookmarks Action Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-800" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Deterministic Batch Classification
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Evaluate uncategorized bookmarks against owner rules, browser source-folder mappings, hostname/path rules, and the tokenized keyword dictionary. Manual category locks are strictly protected.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNavigateToRules}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Manage Rules ({stats.ownerRulesCount})
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={previewLoading}
              onClick={handlePreviewBatch}
              data-testid="preview-classify-uncategorized-btn"
            >
              <Play className="h-4 w-4" />
              {previewLoading
                ? 'Analyzing...'
                : `Preview Classification (${stats.uncategorizedCount} Uncategorized)`}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="include-auto-checkbox"
            type="checkbox"
            checked={includeAutoInBatch}
            onChange={(e) => setIncludeAutoInBatch(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900"
          />
          <Label
            htmlFor="include-auto-checkbox"
            className="text-xs text-slate-600 cursor-pointer"
          >
            Also re-evaluate previously auto-classified bookmarks (unlocked only; manual locks are always skipped)
          </Label>
        </div>

        {batchPreview && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Batch Classification Impact Preview
                </h3>
                <p className="text-xs text-slate-600">
                  Review deterministic outcomes before applying changes to PostgreSQL.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchPreview(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={applyingBatch || batchPreview.totalEvaluated === 0}
                  onClick={handleConfirmApplyBatch}
                  data-testid="confirm-apply-classification-btn"
                >
                  {applyingBatch
                    ? 'Applying...'
                    : `Confirm & Apply (${batchPreview.totalEvaluated} Bookmarks)`}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Auto-Categorize (&ge;90%)</span>
                <p className="font-mono text-lg font-bold text-emerald-700 mt-1">
                  {batchPreview.highConfidenceAutoCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Suggest for Review (65–89%)</span>
                <p className="font-mono text-lg font-bold text-amber-700 mt-1">
                  {batchPreview.mediumConfidenceSuggestedCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Needs Manual Review (&lt;65%)</span>
                <p className="font-mono text-lg font-bold text-slate-700 mt-1">
                  {batchPreview.lowConfidenceNeedsReviewCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Manual Locks Protected</span>
                <p className="font-mono text-lg font-bold text-slate-900 mt-1">
                  {batchPreview.skippedManualLocksCount}
                </p>
              </div>
            </div>

            {batchPreview.items.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Bookmark</th>
                      <th className="py-2 px-3 font-semibold">Proposed Category</th>
                      <th className="py-2 px-3 font-semibold">Confidence</th>
                      <th className="py-2 px-3 font-semibold">Rule / Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchPreview.items.slice(0, 15).map((item) => {
                      const catLabel = item.result.categoryName
                        ? item.result.subcategoryName
                          ? `${item.result.categoryName} / ${item.result.subcategoryName}`
                          : item.result.categoryName
                        : 'Uncategorized (Manual Review)';
                      const pct = Math.round(item.result.confidence * 100);
                      return (
                        <tr key={item.bookmarkId}>
                          <td className="py-2 px-3 max-w-xs">
                            <p className="font-medium text-slate-900 truncate">
                              {item.title}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 truncate">
                              {item.originalUrl}
                            </p>
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {catLabel}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums">
                            {pct}% ({item.result.status})
                          </td>
                          <td className="py-2 px-3 text-slate-600 max-w-sm truncate">
                            {item.result.evidence[0] ||
                              item.result.reviewReason ||
                              'Evaluated by deterministic rule engine.'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {actionMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Manual Review Queue Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Manual Classification Review Queue
            </h2>
            <p className="text-xs text-slate-500">
              Approve medium-confidence suggestions, assign categories manually, or promote a decision into a reusable deterministic rule.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(['pending', 'resolved', 'dismissed', 'all'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading classification review queue...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
            <p className="font-display text-sm font-semibold text-slate-900">
              No {statusFilter === 'all' ? '' : statusFilter} review items
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              When bookmarks have medium or low classification confidence (&lt; 90%) or conflicting folder signals, they appear here for one-click owner review.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {items.map((item) => {
              const suggestedLabel = item.suggestedCategoryName
                ? item.suggestedSubcategoryName
                  ? `${item.suggestedCategoryName} / ${item.suggestedSubcategoryName}`
                  : item.suggestedCategoryName
                : null;
              const pct = Math.round(item.confidence * 100);
              const isBusy = resolvingId === item.bookmarkId;

              return (
                <div
                  key={item.id}
                  data-testid={`review-queue-item-${item.bookmarkId}`}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
                        {item.bookmarkTitle}
                      </h3>
                      <a
                        href={item.bookmarkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-800 shrink-0"
                        aria-label={`Open ${item.bookmarkTitle}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <p className="font-mono text-xs text-slate-500 truncate">
                      {item.bookmarkUrl}
                    </p>

                    {item.sourceFolderPath.length > 0 && (
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <FolderTree className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>
                          Imported Folder:{' '}
                          <strong className="font-medium text-slate-800">
                            {item.sourceFolderPath.join(' / ')}
                          </strong>
                        </span>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="text-slate-500">Suggested:</span>
                      <span className="font-semibold text-slate-900">
                        {suggestedLabel || 'Uncategorized (No confident match)'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-600">
                        Confidence: {pct}%
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      {item.reviewReason || item.evidence[0] || ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {suggestedLabel && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isBusy}
                        onClick={() =>
                          handleQuickResolve(item, 'accept_suggestion')
                        }
                      >
                        Accept Suggestion
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => openChooseModal(item)}
                    >
                      Choose Category / Rule
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() =>
                        handleQuickResolve(item, 'keep_uncategorized')
                      }
                    >
                      Keep Uncategorized
                    </Button>

                    {item.status === 'pending' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleQuickResolve(item, 'dismiss')}
                      >
                        Mark Reviewed
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Choose Category + Option A / Option B Reusable Rule Modal */}
      {activeChooseItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-category-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3
                id="choose-category-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                Assign Category & Rule Preference
              </h3>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {activeChooseItem.bookmarkTitle} ({activeChooseItem.bookmarkUrl})
              </p>
            </div>

            <form onSubmit={handleConfirmChooseModal} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="review-main-cat">Main Category</Label>
                  <select
                    id="review-main-cat"
                    value={selectedMainId}
                    onChange={(e) => {
                      setSelectedMainId(e.target.value);
                      setSelectedSubId('');
                    }}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">Select Main Category...</option>
                    {categoriesTree.map((main) => (
                      <option key={main.id} value={main.id}>
                        {main.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="review-sub-cat">Subcategory</Label>
                  <select
                    id="review-sub-cat"
                    value={selectedSubId}
                    onChange={(e) => setSelectedSubId(e.target.value)}
                    disabled={!selectedMainId}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 disabled:bg-slate-50"
                  >
                    <option value="">Main Category Only</option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <p className="text-xs font-semibold text-slate-900">
                  How should this manual categorization apply?
                </p>

                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="ruleOptionMode"
                    checked={ruleOptionMode === 'only_this'}
                    onChange={() => setRuleOptionMode('only_this')}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">
                      Option A — Only This Bookmark
                    </span>
                    <p className="text-slate-600">
                      Update this bookmark and set a manual priority lock without creating a general rule.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="ruleOptionMode"
                    checked={ruleOptionMode === 'create_rule'}
                    onChange={() => setRuleOptionMode('create_rule')}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">
                      Option B — Create a Reusable Rule
                    </span>
                    <p className="text-slate-600">
                      Save an owner-approved rule so matching future or uncategorized bookmarks are classified automatically.
                    </p>
                  </div>
                </label>

                {ruleOptionMode === 'create_rule' && (
                  <div className="pl-6 pt-2 space-y-3 border-t border-slate-200">
                    <div className="space-y-1">
                      <Label htmlFor="review-rule-scope" className="text-xs">
                        Rule Scope
                      </Label>
                      <select
                        id="review-rule-scope"
                        value={ruleScopeType}
                        onChange={(e) => {
                          const nextScope = e.target
                            .value as ClassificationRuleType;
                          setRuleScopeType(nextScope);
                          setRulePattern(
                            deriveDefaultPatternForScope(
                              activeChooseItem,
                              nextScope
                            )
                          );
                        }}
                        className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900"
                      >
                        <option value="exact_url">Exact Normalized URL</option>
                        <option value="path_prefix">URL Path Prefix</option>
                        <option value="hostname">Domain / Hostname</option>
                        <option value="folder_mapping">
                          Source Browser Folder Name
                        </option>
                        <option value="title_keyword">Title Keyword</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="review-rule-pattern" className="text-xs">
                        Rule Match Pattern
                      </Label>
                      <Input
                        id="review-rule-pattern"
                        type="text"
                        value={rulePattern}
                        onChange={(e) => setRulePattern(e.target.value)}
                        className="h-9 text-xs font-mono"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyRuleToUnlocked}
                        onChange={(e) =>
                          setApplyRuleToUnlocked(e.target.checked)
                        }
                      />
                      <span>
                        Also apply this rule to matching unlocked bookmarks now
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveChooseItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={resolvingId === activeChooseItem.bookmarkId}
                >
                  {resolvingId === activeChooseItem.bookmarkId
                    ? 'Saving...'
                    : 'Save Decision'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
