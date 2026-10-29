'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type {
  CategoryWithChildren,
  ClassificationRuleRecord,
  ClassificationRuleType,
} from '@/types/bookmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RulesManagerProps {
  categoriesTree: CategoryWithChildren[];
  onRefreshWorkspace: () => Promise<void>;
}

export function RulesManager({
  categoriesTree,
  onRefreshWorkspace,
}: RulesManagerProps) {
  const [rules, setRules] = useState<ClassificationRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // New rule form state
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<ClassificationRuleType>('hostname');
  const [pattern, setPattern] = useState('');
  const [mainCategoryId, setMainCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [applyToUnlockedNow, setApplyToUnlockedNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Rule impact preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [impactPreview, setImpactPreview] = useState<{
    matchingUnlockedCount: number;
    matchingLockedSkippedCount: number;
    sampleMatches: {
      id: string;
      title: string;
      originalUrl: string;
      domain: string;
      currentCategoryLabel: string | null;
    }[];
  } | null>(null);

  const loadRules = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/v1/classification/rules');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load classification rules.');
      }
      setRules(data.rules || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load classification rules.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const availableSubcategories =
    categoriesTree.find((c) => c.id === mainCategoryId)?.subcategories ?? [];

  const handlePreviewRuleImpact = async () => {
    const effectiveCatId = subcategoryId || mainCategoryId;
    if (!pattern.trim() || !effectiveCatId) {
      setError(
        'Please enter a rule pattern and select a category to preview impact.'
      );
      return;
    }

    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/classification/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rule_impact',
          ruleType,
          pattern: pattern.trim(),
          categoryId: effectiveCatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to preview rule impact.');
      }
      setImpactPreview(data.impact);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to preview rule impact.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const effectiveCatId = subcategoryId || mainCategoryId;
    if (!pattern.trim() || !effectiveCatId) {
      setError('Pattern and destination category are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/classification/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          ruleType,
          pattern: pattern.trim(),
          categoryId: effectiveCatId,
          applyToUnlockedNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create classification rule.');
      }

      setName('');
      setPattern('');
      setImpactPreview(null);
      setStatusMessage(
        data.appliedOutcome
          ? `Created rule "${data.rule.pattern}" and updated ${data.appliedOutcome.autoClassifiedCount} matching unlocked bookmarks.`
          : `Created classification rule "${data.rule.pattern}".`
      );
      await loadRules();
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create classification rule.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRuleEnabled = async (rule: ClassificationRuleRecord) => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/classification/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.isEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update rule state.');
      }
      await loadRules();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update rule state.'
      );
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/classification/rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete rule.');
      }
      setStatusMessage('Classification rule deleted.');
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Create Owner Classification Rule Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="h-5 w-5 text-slate-700" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Create Owner Classification Rule
            </h2>
            <p className="text-xs text-slate-500">
              Define deterministic rules by exact URL, URL path prefix, hostname, browser folder name, or title keyword. Specific rules always outrank generic domain rules, and manual bookmark locks are never overridden.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateRule} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="rule-type-select">Rule Scope</Label>
              <select
                id="rule-type-select"
                value={ruleType}
                onChange={(e) => {
                  setRuleType(e.target.value as ClassificationRuleType);
                  setImpactPreview(null);
                }}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="exact_url">Exact Normalized URL (Priority 10)</option>
                <option value="path_prefix">URL Path Prefix (Priority 20)</option>
                <option value="folder_mapping">
                  Source Browser Folder Mapping (Priority 25)
                </option>
                <option value="hostname">Domain / Hostname (Priority 35)</option>
                <option value="title_keyword">Title Keyword (Priority 45)</option>
              </select>
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <Label htmlFor="rule-pattern-input">Match Pattern</Label>
              <Input
                id="rule-pattern-input"
                type="text"
                required
                placeholder={
                  ruleType === 'exact_url'
                    ? 'https://github.com/org/repo'
                    : ruleType === 'path_prefix'
                    ? 'github.com/vercel/next.js'
                    : ruleType === 'folder_mapping'
                    ? 'Work / Cloud Architecture'
                    : ruleType === 'title_keyword'
                    ? 'postgresql'
                    : 'docs.aws.amazon.com'
                }
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setImpactPreview(null);
                }}
                className="font-mono text-xs"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="rule-main-category">Main Category</Label>
              <select
                id="rule-main-category"
                value={mainCategoryId}
                onChange={(e) => {
                  setMainCategoryId(e.target.value);
                  setSubcategoryId('');
                  setImpactPreview(null);
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

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="rule-sub-category">Subcategory</Label>
              <select
                id="rule-sub-category"
                value={subcategoryId}
                onChange={(e) => {
                  setSubcategoryId(e.target.value);
                  setImpactPreview(null);
                }}
                disabled={!mainCategoryId}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 disabled:bg-slate-50"
              >
                <option value="">Main Only</option>
                {availableSubcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToUnlockedNow}
                  onChange={(e) => setApplyToUnlockedNow(e.target.checked)}
                />
                <span>
                  Immediately classify matching unlocked bookmarks upon saving
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={previewLoading}
                onClick={handlePreviewRuleImpact}
              >
                <Eye className="h-4 w-4" />
                {previewLoading ? 'Checking...' : 'Preview Rule Impact'}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                <Plus className="h-4 w-4" />
                {submitting ? 'Saving Rule...' : 'Save Classification Rule'}
              </Button>
            </div>
          </div>
        </form>

        {impactPreview && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <p className="font-semibold text-slate-900">
              Rule Impact Preview: {impactPreview.matchingUnlockedCount}{' '}
              unlocked bookmarks will match ({impactPreview.matchingLockedSkippedCount}{' '}
              manual-locked bookmarks protected).
            </p>
            {impactPreview.sampleMatches.length > 0 && (
              <ul className="space-y-1 text-slate-600 font-mono text-[11px]">
                {impactPreview.sampleMatches.map((m) => (
                  <li key={m.id} className="truncate">
                    • {m.title} — {m.originalUrl}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {statusMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
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

      {/* Owner Rules Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Owner-Defined Classification Rules ({rules.length})
          </h2>
          <span className="text-xs text-slate-500">
            Evaluated in strict specificity order before built-in folder &amp; domain dictionaries
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading classification rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-medium text-slate-800">
                No custom owner rules saved yet
              </p>
              <p className="text-xs text-slate-500">
                Built-in deterministic folder mappings, hostname rules, and keyword dictionaries are active. Add custom rules above or from the Manual Review Queue.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Scope</th>
                    <th className="py-2.5 px-4 font-semibold">Pattern</th>
                    <th className="py-2.5 px-4 font-semibold">
                      Target Category / Subcategory
                    </th>
                    <th className="py-2.5 px-4 font-semibold">Priority</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rules.map((rule) => {
                    const catLabel = rule.targetCategoryName
                      ? rule.targetSubcategoryName
                        ? `${rule.targetCategoryName} / ${rule.targetSubcategoryName}`
                        : rule.targetCategoryName
                      : 'Uncategorized';
                    return (
                      <tr key={rule.id}>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {rule.ruleType}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {rule.pattern}
                        </td>
                        <td className="py-3 px-4 text-slate-800">{catLabel}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                          {rule.priority} ({Math.round(rule.confidenceScore * 100)}%)
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleRuleEnabled(rule)}
                            className={`font-medium underline cursor-pointer ${
                              rule.isEnabled
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {rule.isEnabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRule(rule.id)}
                            aria-label={`Delete rule ${rule.pattern}`}
                            className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
