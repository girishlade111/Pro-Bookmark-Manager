import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '@/lib/auth/server-auth';
import { ensureOwnerSeedData } from '@/lib/bookmarks/service';
import { listImportJobsForOwner } from '@/lib/imports/service';

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

    const jobs = await listImportJobsForOwner(auth.ownerId);
    return NextResponse.json({ jobs });
  } catch (error: unknown) {
    console.error('Failed to list import jobs:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load import history.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
