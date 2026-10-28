'use client';

import React from 'react';
import {
  ExternalLink,
  Lock,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import type { BookmarkRecord } from '@/types/bookmark';
import { Button } from '@/components/ui/button';

interface BookmarkCardProps {
  bookmark: BookmarkRecord;
  viewMode: 'grid' | 'list';
  onToggleFavorite: (bookmark: BookmarkRecord) => void;
  onEdit: (bookmark: BookmarkRecord) => void;
  onDelete: (bookmark: BookmarkRecord) => void;
}

function getDomainMonogram(domain: string): string {
  const cleaned = domain.replace(/^www\./i, '');
  return (cleaned.slice(0, 2) || 'BM').toUpperCase();
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString.slice(0, 10);
  }
}

export function BookmarkCard({
  bookmark,
  viewMode,
  onToggleFavorite,
  onEdit,
  onDelete,
}: BookmarkCardProps) {
  const categoryLabel = bookmark.primaryCategoryName
    ? bookmark.parentCategoryName
      ? `${bookmark.parentCategoryName} / ${bookmark.primaryCategoryName}`
      : bookmark.primaryCategoryName
    : 'Uncategorized';

  const monogram = getDomainMonogram(bookmark.domain);

  if (viewMode === 'list') {
    return (
      <article className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors duration-150 hover:border-slate-300">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-700"
          >
            {monogram}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
                {bookmark.title}
              </h3>
            </div>

            <p className="font-mono text-xs text-slate-500 truncate" title={bookmark.originalUrl}>
              {bookmark.originalUrl}
            </p>

            {bookmark.description && (
              <p className="text-xs text-slate-600 line-clamp-1">
                {bookmark.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{categoryLabel}</span>
              {bookmark.categoryLocked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-slate-600" title="Explicit owner selection locked against automatic reclassification">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Manual lock
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-500">{bookmark.domain}</span>
              <span aria-hidden="true">·</span>
              <time
                dateTime={bookmark.createdAt}
                className="font-mono tabular-nums text-slate-500"
              >
                {formatDate(bookmark.createdAt)}
              </time>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onToggleFavorite(bookmark)}
            aria-label={
              bookmark.isFavorite
                ? `Remove '${bookmark.title}' from favorites`
                : `Add '${bookmark.title}' to favorites`
            }
            className={
              bookmark.isFavorite
                ? 'text-amber-600 hover:text-amber-700'
                : 'text-slate-400 hover:text-slate-700'
            }
          >
            <Star
              className="h-4 w-4"
              fill={bookmark.isFavorite ? 'currentColor' : 'none'}
            />
          </Button>

          <a
            href={bookmark.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open '${bookmark.title}' in new tab`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit(bookmark)}
            aria-label={`Edit '${bookmark.title}'`}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(bookmark)}
            aria-label={`Delete '${bookmark.title}'`}
            className="text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-slate-300">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-700"
            >
              {monogram}
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                {bookmark.title}
              </h3>
              <p className="font-mono text-xs text-slate-500 truncate">
                {bookmark.domain}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onToggleFavorite(bookmark)}
            aria-label={
              bookmark.isFavorite
                ? `Remove '${bookmark.title}' from favorites`
                : `Add '${bookmark.title}' to favorites`
            }
            className={
              bookmark.isFavorite
                ? 'text-amber-600 hover:text-amber-700'
                : 'text-slate-400 hover:text-slate-700'
            }
          >
            <Star
              className="h-4 w-4"
              fill={bookmark.isFavorite ? 'currentColor' : 'none'}
            />
          </Button>
        </div>

        <p
          className="font-mono text-xs text-slate-500 truncate"
          title={bookmark.originalUrl}
        >
          {bookmark.originalUrl}
        </p>

        {bookmark.description && (
          <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
            {bookmark.description}
          </p>
        )}

        {bookmark.notes && (
          <p className="text-xs text-slate-500 italic line-clamp-1">
            Note: {bookmark.notes}
          </p>
        )}
      </div>

      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 min-w-0">
          <span className="font-medium text-slate-700 truncate">
            {categoryLabel}
          </span>
          {bookmark.categoryLocked && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="inline-flex items-center gap-1 text-slate-600"
                title="Explicit owner selection locked against automatic reclassification"
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
                Manual
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <time
            dateTime={bookmark.createdAt}
            className="font-mono tabular-nums text-slate-500"
          >
            {formatDate(bookmark.createdAt)}
          </time>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a
            href={bookmark.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open '${bookmark.title}' in new tab`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(bookmark)}
            aria-label={`Edit '${bookmark.title}'`}
            className="h-8 w-8 p-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(bookmark)}
            aria-label={`Delete '${bookmark.title}'`}
            className="h-8 w-8 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
