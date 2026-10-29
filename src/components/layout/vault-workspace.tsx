'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  LayoutDashboard,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import type {
  AuthSessionState,
  BookmarkRecord,
  CategoryWithChildren,
  DashboardSummary,
} from '@/types/bookmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookmarkCard } from '@/components/bookmarks/bookmark-card';
import { BookmarkFormModal } from '@/components/bookmarks/bookmark-form-modal';
import { DeleteConfirmModal } from '@/components/bookmarks/delete-confirm-modal';
import { CategoryManager } from '@/components/categories/category-manager';
import { ReviewQueueManager } from '@/components/classification/review-queue-manager';
import { RulesManager } from '@/components/classification/rules-manager';
import { ImportManager } from '@/components/imports/import-manager';

export type WorkspaceSection =
  | 'dashboard'
  | 'bookmarks'
  | 'categories'
  | 'favorites'
  | 'imports'
  | 'review'
  | 'rules';

interface VaultWorkspaceProps {
  initialSection?: WorkspaceSection;
}

export function VaultWorkspace({
  initialSection = 'dashboard',
}: VaultWorkspaceProps) {
  const router = useRouter();

  const [activeSection, setActiveSection] =
    useState<WorkspaceSection>(initialSection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authState, setAuthState] = useState<AuthSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary>({
    totalBookmarks: 0,
    totalCategories: 0,
    favoritesCount: 0,
    manualLockedCount: 0,
    uncategorizedCount: 0,
    recentBookmarks: [],
  });
  const [categoriesTree, setCategoriesTree] = useState<CategoryWithChildren[]>(
    []
  );
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // Filtering and view mode state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] =
    useState<BookmarkRecord | null>(null);
  const [deletingBookmark, setDeletingBookmark] =
    useState<BookmarkRecord | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    setErrorMessage(null);
    try {
      let sessionRes = await fetch('/api/auth/session');
      let sessionData = await sessionRes.json();

      if (!sessionData.authorizedOwner) {
        const initRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'owner_session' }),
        });

        if (initRes.ok) {
          sessionRes = await fetch('/api/auth/session');
          sessionData = await sessionRes.json();
        }
      }

      setAuthState(sessionData);

      if (!sessionData.authorizedOwner) {
        setLoading(false);
        return;
      }

      const [dashRes, bmRes, revRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/bookmarks'),
        fetch('/api/v1/classification/review?status=pending'),
      ]);

      if (!dashRes.ok || !bmRes.ok) {
        throw new Error('Failed to load bookmark library from PostgreSQL.');
      }

      const dashData = await dashRes.json();
      const bmData = await bmRes.json();
      const revData = revRes.ok ? await revRes.json() : null;

      setSummary(dashData.summary);
      setCategoriesTree(dashData.categories.tree || []);
      setBookmarks(bmData.bookmarks || []);
      if (revData?.stats) {
        setPendingReviewCount(revData.stats.pendingReviewCount ?? 0);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to load workspace data from database.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((b) => {
      if (activeSection === 'favorites' && !b.isFavorite) {
        return false;
      }
      if (uncategorizedOnly && b.primaryCategoryId !== null) {
        return false;
      }
      if (selectedCategoryId) {
        const matchesPrimary = b.primaryCategoryId === selectedCategoryId;
        const matchesParent = b.parentCategoryId === selectedCategoryId;
        if (!matchesPrimary && !matchesParent) {
          return false;
        }
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const tagsStr = (b.tags ?? []).map((t) => t.name).join(' ');
        const hay = [
          b.title,
          b.domain,
          b.originalUrl,
          b.description ?? '',
          b.notes ?? '',
          b.primaryCategoryName ?? '',
          b.parentCategoryName ?? '',
          tagsStr,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [
    bookmarks,
    activeSection,
    uncategorizedOnly,
    selectedCategoryId,
    searchQuery,
  ]);

  const selectedCategoryName = useMemo(() => {
    if (uncategorizedOnly) return 'Uncategorized';
    if (!selectedCategoryId) return null;
    for (const main of categoriesTree) {
      if (main.id === selectedCategoryId) return main.name;
      const sub = main.subcategories.find((s) => s.id === selectedCategoryId);
      if (sub) return `${main.name} / ${sub.name}`;
    }
    return null;
  }, [categoriesTree, selectedCategoryId, uncategorizedOnly]);

  const handleOpenAddModal = () => {
    setEditingBookmark(null);
    setFormModalOpen(true);
  };

  const handleOpenEditModal = (bookmark: BookmarkRecord) => {
    setEditingBookmark(bookmark);
    setFormModalOpen(true);
  };

  const handleToggleFavorite = async (bookmark: BookmarkRecord) => {
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !bookmark.isFavorite }),
      });
      if (res.ok) {
        await loadWorkspaceData();
      }
    } catch {
      setErrorMessage('Failed to update favorite status.');
    }
  };

  const handleConfirmDelete = async (bookmarkId: string) => {
    const res = await fetch(`/api/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMessage(data.error || 'Failed to delete bookmark.');
      return;
    }
    await loadWorkspaceData();
  };

  const handleSelectCategoryFromSidebar = (
    categoryId: string | null,
    uncategorized = false
  ) => {
    setSelectedCategoryId(categoryId);
    setUncategorizedOnly(uncategorized);
    setActiveSection('bookmarks');
    setMobileMenuOpen(false);
  };

  const handleSwitchSection = (section: WorkspaceSection) => {
    setActiveSection(section);
    if (section !== 'bookmarks') {
      setSelectedCategoryId(null);
      setUncategorizedOnly(false);
    }
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/login');
  };

  if (!loading && authState && !authState.authorizedOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold text-slate-900">
                Single-Owner Authorization Required
              </h1>
              <p className="text-xs text-slate-500">
                Private Personal Visual Bookmark Manager
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {authState.reason ||
              'Access to this bookmark vault is restricted to a single immutable owner user ID.'}
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" onClick={() => router.push('/login')}>
              Go to Owner Sign-In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract (5 Top-Level Links) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 sm:gap-8 border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5">
        <a
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            handleSwitchSection('dashboard');
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Personal Bookmark Vault
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => handleSwitchSection('dashboard')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'dashboard'
                ? 'text-slate-900 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryId(null);
              setUncategorizedOnly(false);
              handleSwitchSection('bookmarks');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'bookmarks'
                ? 'text-slate-900 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            All Bookmarks
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSection('categories')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'categories'
                ? 'text-slate-900 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSection('review')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'review' || activeSection === 'rules'
                ? 'text-slate-900 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Smart Classify
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSection('imports')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'imports'
                ? 'text-slate-900 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Import HTML
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleOpenAddModal}
            className="whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Bookmark
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Bar (< md) */}
      <div className="flex md:hidden items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-label="Open navigation menu"
        >
          {mobileMenuOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
          <span>Menu</span>
        </Button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleSwitchSection('dashboard')}
            className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeSection === 'dashboard'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSection('bookmarks')}
            className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeSection === 'bookmarks'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600'
            }`}
          >
            Bookmarks
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSection('review')}
            className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeSection === 'review' || activeSection === 'rules'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600'
            }`}
          >
            Classify
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Left Sidebar */}
        <aside
          aria-label="Workspace Sidebar"
          className={`${
            mobileMenuOpen
              ? 'fixed inset-y-0 left-0 z-40 w-64 block'
              : 'hidden md:flex'
          } flex-col justify-between border-r border-slate-200 bg-white transition-all duration-150 ${
            sidebarCollapsed ? 'md:w-16' : 'md:w-64'
          } shrink-0`}
        >
          <div className="p-3 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between px-2">
              {!sidebarCollapsed && (
                <span className="text-xs font-semibold text-slate-400">
                  Library Views
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={
                  sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                className="hidden md:inline-flex h-7 w-7 text-slate-500"
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>

            <nav aria-label="Sidebar Views" className="space-y-1">
              <button
                type="button"
                onClick={() => handleSwitchSection('dashboard')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'dashboard'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Dashboard</span>}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId(null);
                  setUncategorizedOnly(false);
                  handleSwitchSection('bookmarks');
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'bookmarks' &&
                  !selectedCategoryId &&
                  !uncategorizedOnly
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Bookmark className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>All Bookmarks</span>}
                </span>
                {!sidebarCollapsed && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {summary.totalBookmarks}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSection('categories')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'categories'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <FolderTree className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Categories (18/83)</span>}
                </span>
                {!sidebarCollapsed && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {summary.totalCategories}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSection('review')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'review'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Review Queue</span>}
                </span>
                {!sidebarCollapsed && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {pendingReviewCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSection('rules')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'rules'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Smart Rules</span>}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSection('favorites')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'favorites'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Star className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Favorites</span>}
                </span>
                {!sidebarCollapsed && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {summary.favoritesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSection('imports')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeSection === 'imports'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Upload className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>Import Bookmarks</span>}
                </span>
              </button>
            </nav>

            {!sidebarCollapsed && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-semibold text-slate-400">
                    Categories
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSwitchSection('categories')}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Manage
                  </button>
                </div>

                <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => handleSelectCategoryFromSidebar(null, true)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      uncategorizedOnly
                        ? 'bg-slate-900 text-white font-medium'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">Uncategorized</span>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        uncategorizedOnly ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {summary.uncategorizedCount}
                    </span>
                  </button>

                  {categoriesTree.map((main) => (
                    <div key={main.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectCategoryFromSidebar(main.id, false)
                        }
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                          selectedCategoryId === main.id
                            ? 'bg-slate-900 text-white font-medium'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{main.name}</span>
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            selectedCategoryId === main.id
                              ? 'text-slate-200'
                              : 'text-slate-400'
                          }`}
                        >
                          {main.bookmarkCount}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Account / Sign-Out Footer */}
          <div className="border-t border-slate-200 p-3 pb-14">
            {!sidebarCollapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {authState?.displayName || 'Vault Owner'}
                  </p>
                  <p
                    className="font-mono text-[11px] text-slate-500 truncate"
                    title={authState?.uid ?? ''}
                  >
                    UID: {authState?.uid || 'owner'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="text-xs text-slate-600 hover:text-red-600"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Viewport Content */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-8">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between"
            >
              <span>{errorMessage}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadWorkspaceData()}
              >
                Retry
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-6" aria-busy="true">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-40 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : activeSection === 'dashboard' ? (
            <div className="space-y-8">
              {/* Dashboard Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    Owner Bookmark Overview
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Central PostgreSQL bookmark repository with conservative full-URL duplicate prevention and deterministic 18/83 classification.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSwitchSection('review')}
                  >
                    <Sparkles className="h-4 w-4" />
                    Smart Classify &amp; Review ({pendingReviewCount})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSwitchSection('imports')}
                  >
                    <Upload className="h-4 w-4" />
                    Import Browser HTML
                  </Button>
                </div>
              </div>

              {/* 4-Column Real PostgreSQL Metrics Strip */}
              <section
                aria-label="Bookmark Library Metrics"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Total Bookmarks
                  </p>
                  <p
                    data-testid="metric-total-bookmarks"
                    className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  >
                    {summary.totalBookmarks}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Canonical full-URL records
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Total Categories
                  </p>
                  <p
                    data-testid="metric-total-categories"
                    className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  >
                    {summary.totalCategories}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    18 main categories &amp; subcategories
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Favorites
                  </p>
                  <p
                    data-testid="metric-favorites-count"
                    className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  >
                    {summary.favoritesCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Starred priority bookmarks
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Manual Priority Locks
                  </p>
                  <p
                    data-testid="metric-manual-locks"
                    className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  >
                    {summary.manualLockedCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Protected from auto-override
                  </p>
                </div>
              </section>

              {/* Recently Added Bookmarks Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Recently Added Bookmarks
                    </h2>
                    <p className="text-xs text-slate-500">
                      Latest entries stored in your private PostgreSQL library
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSwitchSection('bookmarks')}
                  >
                    View All ({summary.totalBookmarks})
                  </Button>
                </div>

                {summary.recentBookmarks.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Your bookmark vault is empty
                    </h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      Add your first personal bookmark or import a Netscape Bookmark HTML file to store it in PostgreSQL with full-URL duplicate detection.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button type="button" onClick={handleOpenAddModal}>
                        <Plus className="h-4 w-4" />
                        Add First Bookmark
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSwitchSection('imports')}
                      >
                        <Upload className="h-4 w-4" />
                        Import HTML
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {summary.recentBookmarks.map((bm) => (
                      <BookmarkCard
                        key={bm.id}
                        bookmark={bm}
                        viewMode="grid"
                        onToggleFavorite={handleToggleFavorite}
                        onEdit={handleOpenEditModal}
                        onDelete={setDeletingBookmark}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : activeSection === 'categories' ? (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  Categories &amp; Subcategories (18/83 Taxonomy)
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Manual category assignments always lock priority over future automated classification.
                </p>
              </div>

              <CategoryManager
                categoriesTree={categoriesTree}
                uncategorizedCount={summary.uncategorizedCount}
                pendingReviewCount={pendingReviewCount}
                onSelectCategoryFilter={handleSelectCategoryFromSidebar}
                onNavigateToReview={() => handleSwitchSection('review')}
                onRefresh={loadWorkspaceData}
              />
            </div>
          ) : activeSection === 'review' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    Deterministic Classification &amp; Manual Review Queue
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Non-AI rule-based categorization across the 18 main categories and 83 subcategories with strict manual lock protection.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSwitchSection('rules')}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Classification Rules
                </Button>
              </div>

              <ReviewQueueManager
                categoriesTree={categoriesTree}
                onRefreshWorkspace={loadWorkspaceData}
                onNavigateToRules={() => handleSwitchSection('rules')}
              />
            </div>
          ) : activeSection === 'rules' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    Classification Rules Management
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Manage owner-defined exact URL, path prefix, hostname, folder mapping, and keyword rules with impact preview.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSwitchSection('review')}
                >
                  <Sparkles className="h-4 w-4" />
                  Back to Review Queue ({pendingReviewCount})
                </Button>
              </div>

              <RulesManager
                categoriesTree={categoriesTree}
                onRefreshWorkspace={loadWorkspaceData}
              />
            </div>
          ) : activeSection === 'imports' ? (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  Browser HTML Bookmark Import
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Parse Netscape Bookmark HTML exports, reconcile duplicates by conservative full URL, preserve nested browser folder hierarchy, and auto-categorize uncategorized imports.
                </p>
              </div>

              <ImportManager
                categoriesTree={categoriesTree}
                onImportCompleted={loadWorkspaceData}
                onNavigateToBookmarks={(catId) => {
                  setSelectedCategoryId(catId || null);
                  setUncategorizedOnly(false);
                  setActiveSection('bookmarks');
                }}
              />
            </div>
          ) : (
            /* All Bookmarks or Favorites View */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    {activeSection === 'favorites'
                      ? 'Favorite Bookmarks'
                      : selectedCategoryName
                      ? `Category: ${selectedCategoryName}`
                      : 'All Bookmarks'}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Showing {filteredBookmarks.length} of {bookmarks.length}{' '}
                    canonical bookmarks
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(selectedCategoryId || uncategorizedOnly) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCategoryId(null);
                        setUncategorizedOnly(false);
                      }}
                    >
                      Clear Category Filter
                    </Button>
                  )}

                  <div
                    role="group"
                    aria-label="Bookmark layout mode"
                    className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      aria-label="Grid view"
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 inline mr-1" />
                      Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      aria-label="List view"
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <List className="h-3.5 w-3.5 inline mr-1" />
                      List
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="search"
                    aria-label="Filter bookmarks by title, URL, domain, tags, or notes"
                    placeholder="Filter by title, full URL, domain, tags, or notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="category-filter-select" className="sr-only">
                    Filter by Category
                  </label>
                  <select
                    id="category-filter-select"
                    value={
                      uncategorizedOnly
                        ? '__uncategorized__'
                        : selectedCategoryId || ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__uncategorized__') {
                        setSelectedCategoryId(null);
                        setUncategorizedOnly(true);
                      } else if (!val) {
                        setSelectedCategoryId(null);
                        setUncategorizedOnly(false);
                      } else {
                        setSelectedCategoryId(val);
                        setUncategorizedOnly(false);
                      }
                    }}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    <option value="">All Categories</option>
                    <option value="__uncategorized__">
                      Uncategorized ({summary.uncategorizedCount})
                    </option>
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
                </div>
              </div>

              {filteredBookmarks.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    No matching bookmarks found
                  </h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    {searchQuery || selectedCategoryId || uncategorizedOnly
                      ? 'No bookmarks match your current filter criteria. Try clearing your filter or adding a new bookmark.'
                      : 'Your personal bookmark collection is currently empty.'}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {(searchQuery ||
                      selectedCategoryId ||
                      uncategorizedOnly) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategoryId(null);
                          setUncategorizedOnly(false);
                        }}
                      >
                        Reset Filters
                      </Button>
                    )}
                    <Button type="button" onClick={handleOpenAddModal}>
                      <Plus className="h-4 w-4" />
                      Add Bookmark
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                      : 'space-y-3'
                  }
                >
                  {filteredBookmarks.map((bm) => (
                    <BookmarkCard
                      key={bm.id}
                      bookmark={bm}
                      viewMode={viewMode}
                      onToggleFavorite={handleToggleFavorite}
                      onEdit={handleOpenEditModal}
                      onDelete={setDeletingBookmark}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Bookmark Modal */}
      <BookmarkFormModal
        open={formModalOpen}
        initialBookmark={editingBookmark}
        categoriesTree={categoriesTree}
        defaultCategoryId={selectedCategoryId}
        onClose={() => setFormModalOpen(false)}
        onSaved={() => void loadWorkspaceData()}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        bookmark={deletingBookmark}
        onClose={() => setDeletingBookmark(null)}
        onConfirmed={handleConfirmDelete}
      />
    </div>
  );
}
