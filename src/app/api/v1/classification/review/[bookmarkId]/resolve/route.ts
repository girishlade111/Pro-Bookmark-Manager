import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../../../lib/auth/server-auth.ts';
import {
  ClassificationValidationError,
  getClassificationOverviewForOwner,
  resolveReviewQueueItemForOwner,
  type ResolveReviewQueueInput,
} from '../../../../../../../lib/classification/classification-service.ts';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ bookmarkId: string }> }
) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const { bookmarkId } = await context.params;
    const body = (await req.json().catch(() => null)) as ResolveReviewQueueInput | null;
    if (!body || !body.action) {
      return NextResponse.json(
        { error: 'Resolution action is required.' },
        { status: 400 }
      );
    }

    const result = await resolveReviewQueueItemForOwner(
      auth.ownerId,
      bookmarkId,
      body
    );
    const stats = await getClassificationOverviewForOwner(auth.ownerId);

    return NextResponse.json({ result, stats });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to resolve review queue item:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to resolve review queue item.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
