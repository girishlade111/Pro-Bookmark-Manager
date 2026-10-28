export type CategoryAssignmentSource = 'manual' | 'uncategorized' | 'auto';

export interface CategoryRecord {
  id: string;
  ownerId: string;
  name: string;
  parentCategoryId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryWithChildren extends CategoryRecord {
  subcategories: CategoryRecord[];
  bookmarkCount: number;
}

export interface BookmarkRecord {
  id: string;
  ownerId: string;
  originalUrl: string;
  normalizedUrlKey: string;
  domain: string;
  title: string;
  description: string | null;
  notes: string | null;
  isFavorite: boolean;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  categorySource: CategoryAssignmentSource;
  categoryLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedUrlResult {
  originalUrl: string;
  canonicalHref: string;
  normalizedUrlKey: string;
  domain: string;
  fallbackTitle: string;
}

export interface DashboardSummary {
  totalBookmarks: number;
  totalCategories: number;
  favoritesCount: number;
  manualLockedCount: number;
  uncategorizedCount: number;
  recentBookmarks: BookmarkRecord[];
}

export interface AuthSessionState {
  authenticated: boolean;
  authorizedOwner: boolean;
  ownerConfigured: boolean;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  reason?: string;
}
