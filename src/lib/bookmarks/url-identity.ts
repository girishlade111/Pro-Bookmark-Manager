import type { NormalizedUrlResult } from '../../types/bookmark.ts';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const SCHEME_PREFIX_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export class InvalidBookmarkUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBookmarkUrlError';
  }
}

export function normalizeBookmarkUrl(rawInput: string): NormalizedUrlResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new InvalidBookmarkUrlError('URL is required and cannot be empty.');
  }

  if (/\s/.test(trimmed)) {
    throw new InvalidBookmarkUrlError('URL must not contain internal whitespace.');
  }

  let candidate = trimmed;

  if (SCHEME_PREFIX_REGEX.test(trimmed)) {
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    const scheme = schemeMatch ? `${schemeMatch[1].toLowerCase()}:` : '';
    if (!ALLOWED_PROTOCOLS.has(scheme)) {
      throw new InvalidBookmarkUrlError(
        `Unsafe or unsupported URL scheme "${scheme}". Only http:// and https:// URLs are allowed.`
      );
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new InvalidBookmarkUrlError(
        'Malformed HTTP/HTTPS URL. Expected format: https://example.com'
      );
    }
  } else {
    if (trimmed.startsWith('//')) {
      throw new InvalidBookmarkUrlError(
        'Protocol-relative URLs are not allowed. Please specify https:// or http://.'
      );
    }
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidBookmarkUrlError(
      'Invalid URL format. Please enter a valid web address (e.g., https://example.com/page).'
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    throw new InvalidBookmarkUrlError(
      `Unsupported URL protocol "${protocol}". Only http: and https: are permitted.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || (!hostname.includes('.') && hostname !== 'localhost')) {
    throw new InvalidBookmarkUrlError(
      'URL must include a valid domain name (e.g., example.com).'
    );
  }

  let portSegment = '';
  if (parsed.port) {
    const isDefaultHttp = protocol === 'http:' && parsed.port === '80';
    const isDefaultHttps = protocol === 'https:' && parsed.port === '443';
    if (!isDefaultHttp && !isDefaultHttps) {
      portSegment = `:${parsed.port}`;
    }
  }

  const pathname = parsed.pathname || '/';
  const search = parsed.search;
  const hash = parsed.hash;

  const normalizedUrlKey = `${protocol}//${hostname}${portSegment}${pathname}${search}${hash}`;
  const originalUrl = SCHEME_PREFIX_REGEX.test(trimmed)
    ? trimmed
    : normalizedUrlKey;

  const fallbackPath =
    pathname && pathname !== '/' ? pathname.replace(/\/$/, '') : '';
  const fallbackTitle = `${hostname}${fallbackPath}`;

  return {
    originalUrl,
    canonicalHref: normalizedUrlKey,
    normalizedUrlKey,
    domain: hostname,
    fallbackTitle,
  };
}

export function resolveCategoryAssignment(
  selectedCategoryId: string | null | undefined
): {
  primaryCategoryId: string | null;
  categorySource: 'manual' | 'uncategorized';
  categoryLocked: boolean;
} {
  const cleanId =
    typeof selectedCategoryId === 'string' && selectedCategoryId.trim().length > 0
      ? selectedCategoryId.trim()
      : null;

  if (cleanId) {
    return {
      primaryCategoryId: cleanId,
      categorySource: 'manual',
      categoryLocked: true,
    };
  }

  return {
    primaryCategoryId: null,
    categorySource: 'uncategorized',
    categoryLocked: false,
  };
}
