import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '@/lib/auth/server-auth';
import {
  getImportJobDetailsForOwner,
  ImportJobNotFoundError,
} from '@/lib/imports/service';

export async function GET(
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
    const details = await getImportJobDetailsForOwner(auth.ownerId, id);
    return NextResponse.json(details);
  } catch (error: unknown) {
    if (error instanceof ImportJobNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: 'IMPORT_JOB_NOT_FOUND' },
        { status: 404 }
      );
    }

    console.error('Failed to fetch import job details:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load import job details.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
