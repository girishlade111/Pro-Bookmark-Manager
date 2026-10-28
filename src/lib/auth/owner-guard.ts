export interface OwnerAccessDecision {
  allowed: boolean;
  status: 200 | 401 | 403 | 503;
  code: 'AUTHORIZED' | 'UNAUTHENTICATED' | 'FORBIDDEN_NOT_OWNER' | 'OWNER_CONFIG_MISSING';
  ownerId: string | null;
  message: string;
}

const PLACEHOLDER_OWNER_IDS = new Set([
  '',
  'your_immutable_owner_auth_uid_here',
  'replace_with_owner_uid',
  'todo',
]);

export function isOwnerIdConfigured(configuredOwnerUid: string | undefined | null): boolean {
  if (!configuredOwnerUid) return false;
  const trimmed = configuredOwnerUid.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_OWNER_IDS.has(trimmed.toLowerCase());
}

export function evaluateOwnerAccess(
  configuredOwnerUid: string | undefined | null,
  authenticatedUserUid: string | undefined | null
): OwnerAccessDecision {
  if (!isOwnerIdConfigured(configuredOwnerUid)) {
    return {
      allowed: false,
      status: 503,
      code: 'OWNER_CONFIG_MISSING',
      ownerId: null,
      message:
        'Owner authorization is not configured. Set BOOKMARK_OWNER_AUTH_USER_ID in .env.local to your immutable Auth user ID.',
    };
  }

  const expectedOwnerId = configuredOwnerUid!.trim();

  if (!authenticatedUserUid || !authenticatedUserUid.trim()) {
    return {
      allowed: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      ownerId: null,
      message: 'Authentication required. Please sign in to access your bookmarks.',
    };
  }

  const actualUid = authenticatedUserUid.trim();

  if (actualUid !== expectedOwnerId) {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN_NOT_OWNER',
      ownerId: null,
      message:
        'Access denied: Your authenticated user ID does not match the configured BOOKMARK_OWNER_AUTH_USER_ID for this private vault.',
    };
  }

  return {
    allowed: true,
    status: 200,
    code: 'AUTHORIZED',
    ownerId: expectedOwnerId,
    message: 'Authorized single owner.',
  };
}
