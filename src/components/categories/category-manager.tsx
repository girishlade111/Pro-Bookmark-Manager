'use client';

import React, { useState } from 'react';
import { Folder, FolderPlus, Trash2 } from 'lucide-react';
import type { CategoryWithChildren } from '@/types/bookmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CategoryManagerProps {
  categoriesTree: CategoryWithChildren[];
  uncategorizedCount: number;
  onSelectCategoryFilter: (categoryId: string | null, uncategorizedOnly?: boolean) => void;
  onRefresh: () => Promise<void>;
}

export function CategoryManager({
  categoriesTree,
  uncategorizedCount,
  onSelectCategoryFilter,
  onRefresh,
}: CategoryManagerProps) {
  const [name, setName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        <div className="flex items-center gap-2.5 mb-4">
          <FolderPlus className="h-5 w-5 text-slate-700" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Create Category or Subcategory
            </h2>
            <p className="text-xs text-slate-500">
              Organize your personal library with manual main categories and nested subcategories.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
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
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Category Hierarchy
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {categoriesTree.length} main categories
          </span>
        </div>

        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {categoriesTree.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">
                No custom categories created yet. Use the form above to add your first main category.
              </p>
            </div>
          ) : (
            categoriesTree.map((main) => (
              <div key={main.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Folder className="h-4 w-4 text-slate-700 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectCategoryFilter(main.id, false)}
                      className="font-display text-sm font-semibold text-slate-900 hover:underline text-left truncate cursor-pointer"
                    >
                      {main.name}
                    </button>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {main.bookmarkCount} bookmarks
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
                  <div className="pl-7 space-y-2 border-l border-slate-200 ml-2">
                    {main.subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-3 py-1"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onSelectCategoryFilter(sub.id, false)}
                            className="font-medium text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                          >
                            {sub.name}
                          </button>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500">Subcategory</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectCategoryFilter(sub.id, false)}
                            className="h-7 px-2 text-xs"
                          >
                            Filter
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={deletingId === sub.id}
                            onClick={() => handleDeleteCategory(sub.id)}
                            aria-label={`Delete subcategory '${sub.name}'`}
                            className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          <div className="p-5 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Uncategorized</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {uncategorizedCount} bookmarks without a selected category
              </span>
            </div>
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
      </section>
    </div>
  );
}
