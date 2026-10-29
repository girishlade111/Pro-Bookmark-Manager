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
  directCount?: number;
}

export interface TagRecord {
  id: string;
  name: string;
  normalizedName: string;
  source: 'manual' | 'auto_rule';
}

export interface ClassificationDecisionSummary {
  classificationMethod: 'manual' | 'auto_classified' | 'suggested' | 'needs_review';
  confidence: number;
  evidence: string[];
  matchedRuleIds: string[];
  rulesetVersion: string;
  requiresReview: boolean;
  createdAt: string;
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
  tags?: TagRecord[];
  latestDecision?: ClassificationDecisionSummary | null;
  sourceFolderPaths?: string[][];
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
  totalSubcategories?: number;
  favoritesCount: number;
  manualLockedCount: number;
  autoClassifiedCount?: number;
  uncategorizedCount: number;
  pendingReviewCount?: number;
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

export type ImportConflictStrategy =
  | 'keep_existing'
  | 'move_to_selected'
  | 'add_secondary_placement';

export type ImportEntryStatus =
  | 'new'
  | 'duplicate_in_upload'
  | 'duplicate_in_db'
  | 'category_conflict'
  | 'invalid';

export interface ParsedHtmlBookmarkOccurrence {
  occurrenceIndex: number;
  sourceFilename: string;
  sourceBrowser: string | null;
  sourceOrder: number;
  originalUrl: string;
  normalizedUrlKey: string | null;
  domain: string | null;
  originalTitle: string;
  displayTitle: string;
  hasMissingTitle: boolean;
  folderPath: string[];
  addDate: string | null;
  lastModified: string | null;
  warnings: string[];
  invalidReason: string | null;
}

export interface ReconciledImportEntry extends ParsedHtmlBookmarkOccurrence {
  status: ImportEntryStatus;
  existingBookmarkId: string | null;
  existingBookmarkTitle: string | null;
  existingCategoryId: string | null;
  existingCategoryLabel: string | null;
  existingCategoryLocked: boolean;
  hasCategoryConflict: boolean;
}

export interface ImportJobRecord {
  id: string;
  ownerId: string;
  originalFilename: string;
  sourceBrowser: string | null;
  fileHash: string;
  status: 'preview' | 'processing' | 'completed' | 'failed' | 'partial';
  normalizationVersion: string;
  destinationCategoryId: string | null;
  destinationCategoryLabel: string | null;
  conflictStrategy: ImportConflictStrategy;
  filesCount: number;
  totalParsedEntries: number;
  uniqueUploadIdentities: number;
  withinUploadDuplicates: number;
  existingDbDuplicates: number;
  newCanonicalBookmarks: number;
  exactDuplicates: number;
  invalidRecords: number;
  missingTitlesCount: number;
  categoryConflictsCount: number;
  warningCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportOccurrenceRecord {
  id: string;
  ownerId: string;
  importJobId: string;
  canonicalBookmarkId: string | null;
  occurrenceIndex: number;
  sourceFilename: string;
  originalUrl: string;
  normalizedUrlKey: string | null;
  originalTitle: string;
  displayTitle: string;
  folderPath: string[];
  addDate: string | null;
  lastModified: string | null;
  sourceBrowser: string | null;
  sourceOrder: number;
  resolutionStatus: string;
  warnings: string[];
  createdAt: string;
}

export interface ImportPreviewResponse {
  job: ImportJobRecord;
  previewToken: string;
  selectedFilenames: string[];
  sampleEntries: ReconciledImportEntry[];
  totalSampleCount: number;
}

export type ClassificationRuleType =
  | 'exact_url'
  | 'path_prefix'
  | 'hostname'
  | 'subdomain'
  | 'folder_mapping'
  | 'title_keyword';

export interface ClassificationRuleRecord {
  id: string;
  ownerId: string;
  name: string;
  ruleType: ClassificationRuleType;
  pattern: string;
  targetCategoryId: string;
  targetCategoryName: string | null;
  targetSubcategoryId: string | null;
  targetSubcategoryName: string | null;
  priority: number;
  confidenceScore: number;
  isEnabled: boolean;
  source: 'owner' | 'system_seed';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationResult {
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  confidence: number;
  status: 'manual' | 'auto_classified' | 'suggested' | 'needs_review';
  matchedRuleIds: string[];
  evidence: string[];
  suggestedTags: string[];
  rulesetVersion: string;
  requiresReview: boolean;
  reviewReason?: string;
}

export interface ReviewQueueItemRecord {
  id: string;
  ownerId: string;
  bookmarkId: string;
  bookmarkTitle: string;
  bookmarkUrl: string;
  bookmarkDomain: string;
  existingCategoryId: string | null;
  existingCategoryLabel: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedSubcategoryId: string | null;
  suggestedSubcategoryName: string | null;
  confidence: number;
  reviewReason: string;
  evidence: string[];
  sourceFolderPath: string[];
  status: 'pending' | 'accepted' | 'corrected' | 'kept_uncategorized' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

export interface ClassificationOverviewStats {
  pendingReviewCount: number;
  autoClassifiedCount: number;
  manuallyCategorizedCount: number;
  uncategorizedCount: number;
  totalRulesCount: number;
  ownerRulesCount: number;
  mainCategoriesCount: number;
  subcategoriesCount: number;
}
