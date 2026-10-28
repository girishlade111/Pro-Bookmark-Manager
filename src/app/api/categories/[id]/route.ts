import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../lib/auth/server-auth.ts';
import {
  CategoryValidationError,
  deleteCategoryForOwner,
} from '../../../../lib/categories/service.ts';

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
    await deleteCategoryForOwner(auth.ownerId, id);

    return NextResponse.json({ deleted: true, id });
  } catch (error: unknown) {
    if (error instanceof CategoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Failed to delete category:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to delete category.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
