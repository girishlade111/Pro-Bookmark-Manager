'use client';

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { BookmarkRecord } from '@/types/bookmark';
import { Button } from '@/components/ui/button';

interface DeleteConfirmModalProps {
  bookmark: BookmarkRecord | null;
  onClose: () => void;
  onConfirmed: (bookmarkId: string) => Promise<void>;
}

export function DeleteConfirmModal({
  bookmark,
  onClose,
  onConfirmed,
}: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  if (!bookmark) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirmed(bookmark.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-bookmark-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="delete-bookmark-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                Delete Bookmark
              </h2>
              <p className="text-xs text-slate-500">
                This action permanently removes the canonical bookmark.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close delete confirmation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1">
          <p className="font-display text-sm font-semibold text-slate-900 truncate">
            {bookmark.title}
          </p>
          <p className="font-mono text-xs text-slate-500 break-all">
            {bookmark.originalUrl}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
