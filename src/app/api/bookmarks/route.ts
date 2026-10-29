import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../lib/auth/server-auth.ts';
import {
  createBookmarkForOwner,
  DuplicateBookmarkError,
  ensureOwnerSeedData,
  listBookmarksForOwner,
} from '../../../lib/bookmarks/service.ts';
import { InvalidBookmarkUrlError } from '../../../lib/bookmarks/url-identity.ts';
import { createBookmarkSchema } from '../../../lib/validation/schemas.ts';

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    await ensureOwnerSeedData(auth.ownerId);

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get('categoryId');
    const favoriteOnly = searchParams.get('favoriteOnly') === 'true';
    const uncategorizedOnly = searchParams.get('uncategorizedOnly') === 'true';
    const search = searchParams.get('search') ?? undefined;

    const bookmarks = await listBookmarksForOwner(auth.ownerId, {
      categoryId: categoryId || null,
      favoriteOnly,
      uncategorizedOnly,
      search,
    });

    return NextResponse.json({ bookmarks });
  } catch (error: unknown) {
    console.error('Failed to list bookmarks:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load bookmarks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const parsed = createBookmarkSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || 'Invalid bookmark input.' },
        { status: 400 }
      );
    }

    const created = await createBookmarkForOwner(auth.ownerId, {
      url: parsed.data.url,
      title: parsed.data.title || null,
      description: parsed.data.description || null,
      notes: parsed.data.notes || null,
      categoryId: parsed.data.categoryId || null,
      isFavorite: parsed.data.isFavorite ?? false,
      tags: parsed.data.tags,
    });

    return NextResponse.json({ bookmark: created }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof DuplicateBookmarkError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'DUPLICATE_FULL_URL',
          normalizedUrlKey: error.normalizedUrlKey,
          existingBookmark: error.existingBookmark,
        },
        { status: 409 }
      );
    }

    if (error instanceof InvalidBookmarkUrlError) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_URL' },
        { status: 400 }
      );
    }

    console.error('Failed to create bookmark:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create bookmark.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
