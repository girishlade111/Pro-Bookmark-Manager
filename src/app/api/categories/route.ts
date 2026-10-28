import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../lib/auth/server-auth.ts';
import { ensureOwnerSeedData } from '../../../lib/bookmarks/service.ts';
import {
  CategoryValidationError,
  createCategoryForOwner,
  listCategoriesForOwner,
} from '../../../lib/categories/service.ts';
import { createCategorySchema } from '../../../lib/validation/schemas.ts';

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

    const data = await listCategoriesForOwner(auth.ownerId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Failed to list categories:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load categories.';
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

    const parsed = createCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || 'Invalid category input.' },
        { status: 400 }
      );
    }

    const category = await createCategoryForOwner(auth.ownerId, {
      name: parsed.data.name,
      parentCategoryId: parsed.data.parentCategoryId || null,
      sortOrder: parsed.data.sortOrder,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof CategoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Failed to create category:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create category.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
