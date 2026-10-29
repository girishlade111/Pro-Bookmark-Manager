'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Lock, Sparkles, X } from 'lucide-react';
import type {
  BookmarkRecord,
  CategoryWithChildren,
  ClassificationRuleType,
} from '@/types/bookmark';
import { normalizeBookmarkUrl } from '@/lib/bookmarks/url-identity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface BookmarkFormModalProps {
  open: boolean;
  initialBookmark?: BookmarkRecord | null;
  categoriesTree: CategoryWithChildren[];
  defaultCategoryId?: string | null;
  onClose: () => void;
  onSaved: (bookmark: BookmarkRecord) => void;
}

export function BookmarkFormModal({
  open,
  initialBookmark,
  categoriesTree,
  defaultCategoryId,
  onClose,
  onSaved,
}: BookmarkFormModalProps) {
  const isEditing = Boolean(initialBookmark);

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [mainCategoryId, setMainCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);

  // Option A / Option B Reusable Rule state when manually selecting a category
  const [createRuleOption, setCreateRuleOption] = useState(false);
  const [ruleScopeType, setRuleScopeType] =
    useState<ClassificationRuleType>('hostname');
  const [rulePattern, setRulePattern] = useState('');
  const [applyRuleToUnlocked, setApplyRuleToUnlocked] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    normalizedUrlKey: string;
    existingBookmark: BookmarkRecord;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    setDuplicateConflict(null);
    setCreateRuleOption(false);

    if (initialBookmark) {
      setUrl(initialBookmark.originalUrl);
      setTitle(initialBookmark.title);
      setDescription(initialBookmark.description ?? '');
      setNotes(initialBookmark.notes ?? '');
      setTagsInput(
        (initialBookmark.tags ?? []).map((t) => t.name).join(', ')
      );
      setIsFavorite(initialBookmark.isFavorite);
      setRuleScopeType('hostname');
      setRulePattern(initialBookmark.domain);

      if (initialBookmark.parentCategoryId && initialBookmark.primaryCategoryId) {
        setMainCategoryId(initialBookmark.parentCategoryId);
        setSubCategoryId(initialBookmark.primaryCategoryId);
      } else if (initialBookmark.primaryCategoryId) {
        setMainCategoryId(initialBookmark.primaryCategoryId);
        setSubCategoryId('');
      } else {
        setMainCategoryId('');
        setSubCategoryId('');
      }
    } else {
      setUrl('');
      setTitle('');
      setDescription('');
      setNotes('');
      setTagsInput('');
      setIsFavorite(false);
      setRuleScopeType('hostname');
      setRulePattern('');

      if (defaultCategoryId) {
        const parentMatch = categoriesTree.find((c) => c.id === defaultCategoryId);
        if (parentMatch) {
          setMainCategoryId(parentMatch.id);
          setSubCategoryId('');
        } else {
          const ownerMain = categoriesTree.find((c) =>
            c.subcategories.some((sub) => sub.id === defaultCategoryId)
          );
          if (ownerMain) {
            setMainCategoryId(ownerMain.id);
            setSubCategoryId(defaultCategoryId);
          } else {
            setMainCategoryId('');
            setSubCategoryId('');
          }
        }
      } else {
        setMainCategoryId('');
        setSubCategoryId('');
      }
    }
  }, [open, initialBookmark, defaultCategoryId, categoriesTree]);

  const availableSubcategories = useMemo(() => {
    const selectedMain = categoriesTree.find((c) => c.id === mainCategoryId);
    return selectedMain ? selectedMain.subcategories : [];
  }, [categoriesTree, mainCategoryId]);

  const liveUrlPreview = useMemo(() => {
    if (!url.trim()) return null;
    try {
      return normalizeBookmarkUrl(url);
    } catch {
      return null;
    }
  }, [url]);

  if (!open) return null;

  const handleMainCategoryChange = (nextMainId: string) => {
    setMainCategoryId(nextMainId);
    setSubCategoryId('');
    if (nextMainId && liveUrlPreview && !rulePattern) {
      setRulePattern(liveUrlPreview.domain);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setDuplicateConflict(null);

    try {
      normalizeBookmarkUrl(url);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Please enter a valid URL.'
      );
      return;
    }

    const effectiveCategoryId = subCategoryId || mainCategoryId || null;
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setSubmitting(true);
    try {
      const endpoint = isEditing
        ? `/api/bookmarks/${initialBookmark!.id}`
        : '/api/bookmarks';
      const method = isEditing ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        url: url.trim(),
        title: title.trim() || undefined,
        description: description.trim() || null,
        notes: notes.trim() || null,
        categoryId: effectiveCategoryId,
        isFavorite,
        tags: parsedTags,
      };

      if (
        isEditing &&
        createRuleOption &&
        effectiveCategoryId &&
        rulePattern.trim()
      ) {
        payload.createReusableRule = {
          ruleType: ruleScopeType,
          pattern: rulePattern.trim(),
          applyToMatchingUnlocked: applyRuleToUnlocked,
        };
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.code === 'DUPLICATE_FULL_URL') {
          setDuplicateConflict({
            normalizedUrlKey: data.normalizedUrlKey,
            existingBookmark: data.existingBookmark,
          });
          setErrorMessage(data.error);
        } else {
          setErrorMessage(data.error || 'Failed to save bookmark.');
        }
        return;
      }

      onSaved(data.bookmark);
      onClose();
    } catch {
      setErrorMessage('Network error while saving bookmark. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmark-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
    >
      <div className="flex flex-col w-full max-w-lg max-h-[88vh] rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2
              id="bookmark-modal-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              {isEditing ? 'Edit Bookmark' : 'Add Bookmark'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Deduplicated by normalized full URL identity (never domain-only).
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close bookmark form"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-1.5"
              >
                <div className="flex items-start gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
                {duplicateConflict && (
                  <div className="pl-6 space-y-1 text-red-700">
                    <p className="font-mono text-[11px] break-all">
                      Identity Key: {duplicateConflict.normalizedUrlKey}
                    </p>
                    <p>
                      Existing Category:{' '}
                      <strong className="font-semibold">
                        {duplicateConflict.existingBookmark.primaryCategoryName
                          ? duplicateConflict.existingBookmark.parentCategoryName
                            ? `${duplicateConflict.existingBookmark.parentCategoryName} / ${duplicateConflict.existingBookmark.primaryCategoryName}`
                            : duplicateConflict.existingBookmark.primaryCategoryName
                          : 'Uncategorized'}
                      </strong>{' '}
                      (existing category preserved without modification)
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-url-input">URL (Required)</Label>
              <Input
                id="bookmark-url-input"
                type="text"
                required
                placeholder="https://example.com/articles/deep-dive?ref=nav#section-2"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {liveUrlPreview && (
                <p className="font-mono text-[11px] text-slate-500 truncate">
                  Normalized full-URL key: {liveUrlPreview.normalizedUrlKey}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-title-input">
                Title (Optional — falls back to hostname/path)
              </Label>
              <Input
                id="bookmark-title-input"
                type="text"
                placeholder={
                  liveUrlPreview
                    ? liveUrlPreview.fallbackTitle
                    : 'Leave blank to use hostname/path fallback'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bookmark-main-category">Main Category</Label>
                <select
                  id="bookmark-main-category"
                  value={mainCategoryId}
                  onChange={(e) => handleMainCategoryChange(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  <option value="">
                    Auto-Categorize / Uncategorized
                  </option>
                  {categoriesTree.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bookmark-sub-category">Subcategory</Label>
                <select
                  id="bookmark-sub-category"
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  disabled={!mainCategoryId || availableSubcategories.length === 0}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {!mainCategoryId
                      ? 'Select a main category first'
                      : availableSubcategories.length === 0
                      ? 'No subcategories'
                      : 'All / Main category only'}
                  </option>
                  {availableSubcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {mainCategoryId || subCategoryId ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                  <Lock className="h-3.5 w-3.5 text-slate-700 shrink-0" />
                  <span>
                    Explicit category selection applies a permanent manual priority lock.
                  </span>
                </div>

                {isEditing && (
                  <div className="pt-1 space-y-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createRuleOption}
                        onChange={(e) => setCreateRuleOption(e.target.checked)}
                      />
                      <span>
                        Option B — Also create a reusable classification rule for this category
                      </span>
                    </label>

                    {createRuleOption && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <select
                          value={ruleScopeType}
                          onChange={(e) =>
                            setRuleScopeType(
                              e.target.value as ClassificationRuleType
                            )
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
                        >
                          <option value="hostname">Domain / Hostname</option>
                          <option value="path_prefix">URL Path Prefix</option>
                          <option value="exact_url">Exact URL</option>
                          <option value="title_keyword">Title Keyword</option>
                        </select>
                        <Input
                          type="text"
                          value={rulePattern}
                          onChange={(e) => setRulePattern(e.target.value)}
                          placeholder="Match pattern"
                          className="h-8 text-xs font-mono"
                        />
                        <label className="sm:col-span-2 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={applyRuleToUnlocked}
                            onChange={(e) =>
                              setApplyRuleToUnlocked(e.target.checked)
                            }
                          />
                          <span>
                            Also apply this rule to matching unlocked bookmarks
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-slate-700 shrink-0" />
                <span>
                  Leaving category blank allows the deterministic engine to auto-classify or queue for review.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-tags-input">
                Tags (Optional — comma-separated)
              </Label>
              <Input
                id="bookmark-tags-input"
                type="text"
                placeholder="e.g., typescript, postgresql, reference"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-description-input">
                Description (Optional)
              </Label>
              <Textarea
                id="bookmark-description-input"
                placeholder="Brief summary or context for this bookmark..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-notes-input">
                Personal Notes (Optional)
              </Label>
              <Textarea
                id="bookmark-notes-input"
                placeholder="Private owner notes, key takeaways, or why you saved this URL..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="bookmark-favorite-checkbox"
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <Label
                htmlFor="bookmark-favorite-checkbox"
                className="cursor-pointer"
              >
                Mark as Favorite
              </Label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Save Bookmark'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
