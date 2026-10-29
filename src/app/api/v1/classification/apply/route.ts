import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../lib/auth/server-auth.ts';
import {
  applyClassifyUncategorizedForOwner,
  ClassificationValidationError,
  getClassificationOverviewForOwner,
} from '../../../../../lib/classification/classification-service.ts';

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      includeAutoCategorized?: boolean;
      bookmarkIds?: string[];
    };

    const outcome = await applyClassifyUncategorizedForOwner(auth.ownerId, {
      includeAutoCategorized: Boolean(body.includeAutoCategorized),
      bookmarkIds: Array.isArray(body.bookmarkIds) ? body.bookmarkIds : undefined,
    });

    const stats = await getClassificationOverviewForOwner(auth.ownerId);

    return NextResponse.json({ outcome, stats });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to apply batch classification:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to apply deterministic classification.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
