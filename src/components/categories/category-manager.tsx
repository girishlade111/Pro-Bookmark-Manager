'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  Folder,
  FolderPlus,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { CategoryWithChildren } from '@/types/bookmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CategoryManagerProps {
  categoriesTree: CategoryWithChildren[];
  uncategorizedCount: number;
  pendingReviewCount?: number;
  onSelectCategoryFilter: (
    categoryId: string | null,
    uncategorizedOnly?: boolean
  ) => void;
  onNavigateToReview?: () => void;
  onRefresh: () => Promise<void>;
}

export function CategoryManager({
  categoriesTree,
  uncategorizedCount,
  pendingReviewCount = 0,
  onSelectCategoryFilter,
  onNavigateToReview,
  onRefresh,
}: CategoryManagerProps) {
  const [name, setName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Taxonomy search filter
  const [searchFilter, setSearchFilter] = useState('');

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const totalSubcategories = useMemo(
    () =>
      categoriesTree.reduce(
        (acc, main) => acc + main.subcategories.length,
        0
      ),
    [categoriesTree]
  );

  const filteredTree = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return categoriesTree;
    return categoriesTree
      .map((main) => {
        const mainMatches = main.name.toLowerCase().includes(q);
        const matchingSubs = main.subcategories.filter((s) =>
          s.name.toLowerCase().includes(q)
        );
        if (mainMatches) {
          return main;
        }
        if (matchingSubs.length > 0) {
          return {
            ...main,
            subcategories: matchingSubs,
          };
        }
        return null;
      })
      .filter((item): item is CategoryWithChildren => item !== null);
  }, [categoriesTree, searchFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          parentCategoryId: parentCategoryId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create category.');
        return;
      }

      setName('');
      setParentCategoryId('');
      await onRefresh();
    } catch {
      setError('Network error while creating category.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
    setError(null);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) {
      setError('Category name cannot be empty.');
      return;
    }
    setSavingRename(true);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to rename category.');
        return;
      }
      setEditingId(null);
      setEditingName('');
      await onRefresh();
    } catch {
      setError('Network error while renaming category.');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingId(catId);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete category.');
        return;
      }
      await onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="h-5 w-5 text-slate-700" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Create or Customize Taxonomy Category
              </h2>
              <p className="text-xs text-slate-500">
                Seeded with the 18 main categories and 83 subcategories. Add custom categories or rename existing ones without breaking stable UUIDs.
              </p>
            </div>
          </div>

          {onNavigateToReview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNavigateToReview}
            >
              <Sparkles className="h-4 w-4" />
              Classification &amp; Review ({pendingReviewCount})
            </Button>
          )}
        </div>

        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-5 space-y-1.5">
            <Label htmlFor="new-category-name">Category Name</Label>
            <Input
              id="new-category-name"
              type="text"
              required
              placeholder="e.g., Architecture, Cloud Infrastructure, Design Systems"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="md:col-span-5 space-y-1.5">
            <Label htmlFor="new-category-parent">
              Parent Category (Optional — leave blank for Main Category)
            </Label>
            <select
              id="new-category-parent"
              value={parentCategoryId}
              onChange={(e) => setParentCategoryId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="">Main Category (Top Level)</option>
              {categoriesTree.map((main) => (
                <option key={main.id} value={main.id}>
                  Subcategory under: {main.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Adding...' : 'Create Category'}
            </Button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Category Hierarchy
            </h2>
            <p
              data-testid="taxonomy-hierarchy-summary"
              className="font-mono text-xs tabular-nums text-slate-500 mt-0.5"
            >
              {categoriesTree.length} main categories · {totalSubcategories}{' '}
              subcategories
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Search 18/83 taxonomy..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Uncategorized</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {uncategorizedCount} bookmarks without a selected category
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToReview && uncategorizedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToReview}
                >
                  Classify Uncategorized
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectCategoryFilter(null, true)}
              >
                View Uncategorized
              </Button>
            </div>
          </div>

          {filteredTree.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">
                No categories match your filter.
              </p>
            </div>
          ) : (
            filteredTree.map((main) => (
              <div key={main.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Folder className="h-4 w-4 text-slate-700 shrink-0" />
                    {editingId === main.id ? (
                      <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                        <Input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="icon"
                          disabled={savingRename}
                          onClick={() => handleSaveRename(main.id)}
                          aria-label="Save category name"
                          className="h-8 w-8"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel rename"
                          className="h-8 w-8"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectCategoryFilter(main.id, false)}
                          className="font-display text-sm font-semibold text-slate-900 hover:underline text-left truncate cursor-pointer"
                        >
                          {main.name}
                        </button>
                        <span
                          className="text-xs text-slate-400"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          {main.bookmarkCount} bookmarks ({main.subcategories.length} subcategories)
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectCategoryFilter(main.id, false)}
                    >
                      View Bookmarks
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleStartRename(main.id, main.name)}
                      aria-label={`Rename category '${main.name}'`}
                      className="h-8 w-8 text-slate-400 hover:text-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === main.id}
                      onClick={() => handleDeleteCategory(main.id)}
                      aria-label={`Delete category '${main.name}'`}
                      className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {main.subcategories.length > 0 && (
                  <div className="pl-7 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 border-l border-slate-200 ml-2">
                    {main.subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        {editingId === sub.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-7 text-xs"
                            />
                            <Button
                              type="button"
                              size="icon"
                              disabled={savingRename}
                              onClick={() => handleSaveRename(sub.id)}
                              className="h-7 w-7"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingId(null)}
                              className="h-7 w-7"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-xs min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectCategoryFilter(sub.id, false)
                                }
                                className="font-medium text-slate-700 hover:text-slate-900 hover:underline truncate cursor-pointer"
                              >
                                {sub.name}
                              </button>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  onSelectCategoryFilter(sub.id, false)
                                }
                                className="h-6 px-2 text-[11px]"
                              >
                                Filter
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleStartRename(sub.id, sub.name)
                                }
                                aria-label={`Rename subcategory '${sub.name}'`}
                                className="h-6 w-6 text-slate-400 hover:text-slate-800"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={deletingId === sub.id}
                                onClick={() => handleDeleteCategory(sub.id)}
                                aria-label={`Delete subcategory '${sub.name}'`}
                                className="h-6 w-6 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
