import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../lib/auth/server-auth.ts';
import {
  getClassificationOverviewForOwner,
  listReviewQueueForOwner,
} from '../../../../../lib/classification/classification-service.ts';

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status') || 'pending';
    const statusFilter =
      rawStatus === 'resolved' ||
      rawStatus === 'dismissed' ||
      rawStatus === 'all'
        ? rawStatus
        : 'pending';

    const [items, stats] = await Promise.all([
      listReviewQueueForOwner(auth.ownerId, statusFilter),
      getClassificationOverviewForOwner(auth.ownerId),
    ]);

    return NextResponse.json({ items, stats });
  } catch (error: unknown) {
    console.error('Failed to load classification review queue:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load classification review queue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
