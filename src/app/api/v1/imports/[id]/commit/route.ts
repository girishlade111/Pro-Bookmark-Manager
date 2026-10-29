import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '@/lib/auth/server-auth';
import {
  commitImportJobForOwner,
  ImportJobNotFoundError,
  ImportValidationError,
} from '@/lib/imports/service';

export async function POST(
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
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const headerIdempotencyKey = req.headers.get('idempotency-key');
    const idempotencyKey =
      (typeof body.idempotencyKey === 'string' && body.idempotencyKey) ||
      headerIdempotencyKey ||
      null;

    const result = await commitImportJobForOwner(auth.ownerId, id, {
      previewToken: String(body.previewToken || ''),
      idempotencyKey,
      destinationCategoryId: body.destinationCategoryId,
      conflictStrategy: body.conflictStrategy,
      confirmOverrideManualLocks: Boolean(body.confirmOverrideManualLocks),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ImportJobNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: 'IMPORT_JOB_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (error instanceof ImportValidationError) {
      return NextResponse.json(
        { error: error.message, code: 'IMPORT_VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    console.error('Failed to commit import job:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to commit bookmark import job.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
