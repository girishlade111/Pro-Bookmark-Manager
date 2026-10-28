import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BookmarkRecord,
  CategoryAssignmentSource,
  CategoryRecord,
} from '../types/bookmark.ts';

interface StoredPlacement {
  id: string;
  ownerId: string;
  bookmarkId: string;
  categoryId: string;
  isPrimary: boolean;
  assignmentSource: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

interface ServerStoreData {
  users: StoredUser[];
  categories: CategoryRecord[];
  bookmarks: Omit<
    BookmarkRecord,
    'primaryCategoryName' | 'parentCategoryId' | 'parentCategoryName'
  >[];
  bookmarkPlacements: StoredPlacement[];
  seededOwners: string[];
}

const STORE_FILE_PATH = path.join(process.cwd(), '.next', 'pvbm-server-store.json');

declare global {
  var _pvbmServerStore: ServerStoreData | undefined;
}

function loadStore(): ServerStoreData {
  if (global._pvbmServerStore) {
    return global._pvbmServerStore;
  }

  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as ServerStoreData;
      global._pvbmServerStore = parsed;
      return parsed;
    }
  } catch {
    // Ignore read error and initialize fresh store
  }

  const initial: ServerStoreData = {
    users: [],
    categories: [],
    bookmarks: [],
    bookmarkPlacements: [],
    seededOwners: [],
  };
  global._pvbmServerStore = initial;
  return initial;
}

function persistStore(store: ServerStoreData): void {
  global._pvbmServerStore = store;
  try {
    const dir = path.dirname(STORE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore write errors in read-only environments
  }
}

export function fallbackUpsertUser(
  uid: string,
  email: string,
  displayName?: string | null
): StoredUser {
  const store = loadStore();
  const existing = store.users.find((u) => u.uid === uid);
  if (existing) {
    existing.email = email;
    existing.displayName = displayName ?? null;
    persistStore(store);
    return existing;
  }

  const created: StoredUser = {
    id: store.users.length + 1,
    uid,
    email,
    displayName: displayName ?? null,
    createdAt: new Date().toISOString(),
  };
  store.users.push(created);
  persistStore(store);
  return created;
}

export function fallbackGetCategories(ownerId: string): CategoryRecord[] {
  const store = loadStore();
  return store.categories
    .filter((c) => c.ownerId === ownerId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function fallbackCreateCategory(
  ownerId: string,
  input: {
    name: string;
    parentCategoryId: string | null;
    sortOrder?: number;
  }
): CategoryRecord {
  const store = loadStore();
  const now = new Date().toISOString();
  const ownerCats = store.categories.filter((c) => c.ownerId === ownerId);

  const created: CategoryRecord = {
    id: crypto.randomUUID(),
    ownerId,
    name: input.name,
    parentCategoryId: input.parentCategoryId,
    sortOrder: input.sortOrder ?? ownerCats.length,
    createdAt: now,
    updatedAt: now,
  };
  store.categories.push(created);
  persistStore(store);
  return created;
}

export function fallbackDeleteCategory(
  ownerId: string,
  categoryId: string
): boolean {
  const store = loadStore();
  const target = store.categories.find(
    (c) => c.id === categoryId && c.ownerId === ownerId
  );
  if (!target) return false;

  const childIds = store.categories
    .filter((c) => c.ownerId === ownerId && c.parentCategoryId === categoryId)
    .map((c) => c.id);

  const affectedIds = new Set([categoryId, ...childIds]);
  const now = new Date().toISOString();

  for (const bm of store.bookmarks) {
    if (
      bm.ownerId === ownerId &&
      bm.primaryCategoryId &&
      affectedIds.has(bm.primaryCategoryId)
    ) {
      bm.primaryCategoryId = null;
      bm.categorySource = 'uncategorized';
      bm.categoryLocked = false;
      bm.updatedAt = now;
    }
  }

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => !(p.ownerId === ownerId && affectedIds.has(p.categoryId))
  );
  store.categories = store.categories.filter(
    (c) => !(c.ownerId === ownerId && affectedIds.has(c.id))
  );

  persistStore(store);
  return true;
}

export function fallbackHydrateBookmarks(ownerId: string): BookmarkRecord[] {
  const store = loadStore();
  const catMap = new Map(
    store.categories.filter((c) => c.ownerId === ownerId).map((c) => [c.id, c])
  );

  return store.bookmarks
    .filter((b) => b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((row) => {
      const primaryCat = row.primaryCategoryId
        ? catMap.get(row.primaryCategoryId) ?? null
        : null;
      const parentCat =
        primaryCat && primaryCat.parentCategoryId
          ? catMap.get(primaryCat.parentCategoryId) ?? null
          : null;

      return {
        ...row,
        primaryCategoryName: primaryCat ? primaryCat.name : null,
        parentCategoryId: parentCat ? parentCat.id : null,
        parentCategoryName: parentCat ? parentCat.name : null,
      };
    });
}

export function fallbackFindByNormalizedKey(
  ownerId: string,
  normalizedUrlKey: string
): BookmarkRecord | null {
  const all = fallbackHydrateBookmarks(ownerId);
  return all.find((b) => b.normalizedUrlKey === normalizedUrlKey) ?? null;
}

export function fallbackInsertBookmark(
  ownerId: string,
  data: {
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    isFavorite: boolean;
    primaryCategoryId: string | null;
    categorySource: CategoryAssignmentSource;
    categoryLocked: boolean;
  }
): BookmarkRecord {
  const store = loadStore();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  store.bookmarks.push({
    id,
    ownerId,
    originalUrl: data.originalUrl,
    normalizedUrlKey: data.normalizedUrlKey,
    domain: data.domain,
    title: data.title,
    description: data.description,
    notes: data.notes,
    isFavorite: data.isFavorite,
    primaryCategoryId: data.primaryCategoryId,
    categorySource: data.categorySource,
    categoryLocked: data.categoryLocked,
    createdAt: now,
    updatedAt: now,
  });

  if (data.primaryCategoryId) {
    store.bookmarkPlacements.push({
      id: crypto.randomUUID(),
      ownerId,
      bookmarkId: id,
      categoryId: data.primaryCategoryId,
      isPrimary: true,
      assignmentSource: 'manual',
      isLocked: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  persistStore(store);
  return fallbackHydrateBookmarks(ownerId).find((b) => b.id === id)!;
}

export function fallbackUpdateBookmark(
  ownerId: string,
  bookmarkId: string,
  updater: (
    current: Omit<
      BookmarkRecord,
      'primaryCategoryName' | 'parentCategoryId' | 'parentCategoryName'
    >
  ) => {
    originalUrl: string;
    normalizedUrlKey: string;
    domain: string;
    title: string;
    description: string | null;
    notes: string | null;
    isFavorite: boolean;
    primaryCategoryId: string | null;
    categorySource: CategoryAssignmentSource;
    categoryLocked: boolean;
  }
): BookmarkRecord | null {
  const store = loadStore();
  const idx = store.bookmarks.findIndex(
    (b) => b.id === bookmarkId && b.ownerId === ownerId
  );
  if (idx === -1) return null;

  const current = store.bookmarks[idx];
  const next = updater(current);
  const now = new Date().toISOString();

  store.bookmarks[idx] = {
    ...current,
    ...next,
    updatedAt: now,
  };

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => !(p.bookmarkId === bookmarkId && p.isPrimary)
  );

  if (next.primaryCategoryId) {
    store.bookmarkPlacements.push({
      id: crypto.randomUUID(),
      ownerId,
      bookmarkId,
      categoryId: next.primaryCategoryId,
      isPrimary: true,
      assignmentSource: 'manual',
      isLocked: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  persistStore(store);
  return fallbackHydrateBookmarks(ownerId).find((b) => b.id === bookmarkId)!;
}

export function fallbackDeleteBookmark(
  ownerId: string,
  bookmarkId: string
): boolean {
  const store = loadStore();
  const before = store.bookmarks.length;
  store.bookmarks = store.bookmarks.filter(
    (b) => !(b.id === bookmarkId && b.ownerId === ownerId)
  );
  if (store.bookmarks.length === before) return false;

  store.bookmarkPlacements = store.bookmarkPlacements.filter(
    (p) => p.bookmarkId !== bookmarkId
  );
  persistStore(store);
  return true;
}

export function fallbackEnsureSeeded(
  ownerId: string,
  seedFn: () => void
): void {
  const store = loadStore();
  if (store.seededOwners.includes(ownerId)) return;
  const hasCats = store.categories.some((c) => c.ownerId === ownerId);
  const hasBms = store.bookmarks.some((b) => b.ownerId === ownerId);
  if (!hasCats && !hasBms) {
    seedFn();
  }
  if (!store.seededOwners.includes(ownerId)) {
    store.seededOwners.push(ownerId);
    persistStore(store);
  }
}
