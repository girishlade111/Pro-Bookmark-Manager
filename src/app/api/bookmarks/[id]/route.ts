import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../lib/auth/server-auth.ts';
import {
  BookmarkNotFoundError,
  deleteBookmarkForOwner,
  DuplicateBookmarkError,
  updateBookmarkForOwner,
} from '../../../../lib/bookmarks/service.ts';
import { InvalidBookmarkUrlError } from '../../../../lib/bookmarks/url-identity.ts';
import { updateBookmarkSchema } from '../../../../lib/validation/schemas.ts';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const { id } = await context.params;
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const parsed = updateBookmarkSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || 'Invalid bookmark update input.' },
        { status: 400 }
      );
    }

    const updated = await updateBookmarkForOwner(auth.ownerId, id, {
      url: parsed.data.url,
      title: parsed.data.title,
      description: parsed.data.description,
      notes: parsed.data.notes,
      categoryId:
        parsed.data.categoryId === '' ? null : parsed.data.categoryId,
      isFavorite: parsed.data.isFavorite,
    });

    return NextResponse.json({ bookmark: updated });
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

    if (error instanceof BookmarkNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Failed to update bookmark:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update bookmark.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const { id } = await context.params;
    await deleteBookmarkForOwner(auth.ownerId, id);

    return NextResponse.json({ deleted: true, id });
  } catch (error: unknown) {
    if (error instanceof BookmarkNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Failed to delete bookmark:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to delete bookmark.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
