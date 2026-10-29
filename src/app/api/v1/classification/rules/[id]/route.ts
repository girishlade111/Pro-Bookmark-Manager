import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../../lib/auth/server-auth.ts';
import {
  ClassificationValidationError,
  deleteClassificationRuleForOwner,
  updateClassificationRuleForOwner,
} from '../../../../../../lib/classification/classification-service.ts';

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
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      pattern?: string;
      categoryId?: string;
      priority?: number;
      enabled?: boolean;
    };

    const rule = await updateClassificationRuleForOwner(auth.ownerId, id, body);
    return NextResponse.json({ rule });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to update classification rule:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to update classification rule.';
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
    await deleteClassificationRuleForOwner(auth.ownerId, id);
    return NextResponse.json({ deleted: true, id });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Failed to delete classification rule:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to delete classification rule.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
