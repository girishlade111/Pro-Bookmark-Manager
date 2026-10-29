import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '@/lib/auth/server-auth';
import { ensureOwnerSeedData } from '@/lib/bookmarks/service';
import {
  createImportPreviewForOwner,
  InvalidImportFileError,
} from '@/lib/imports/service';
import type { UploadedBookmarkFileInput } from '@/lib/imports/html-parser';

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    await ensureOwnerSeedData(auth.ownerId);

    const contentType = req.headers.get('content-type') || '';
    let files: UploadedBookmarkFileInput[] = [];
    let destinationCategoryId: string | null = null;
    let conflictStrategy: string | null = null;
    let sourceBrowserHint: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const rawFiles = formData.getAll('files');
      destinationCategoryId =
        (formData.get('destinationCategoryId') as string | null) ?? null;
      conflictStrategy =
        (formData.get('conflictStrategy') as string | null) ?? null;
      sourceBrowserHint =
        (formData.get('sourceBrowserHint') as string | null) ?? null;

      for (const item of rawFiles) {
        if (item instanceof File) {
          const text = await item.text();
          files.push({
            filename: item.name,
            content: text,
            sizeBytes: item.size,
            sourceBrowserHint,
          });
        }
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.files)) {
        return NextResponse.json(
          {
            error:
              'Request must include an array of uploaded Netscape Bookmark HTML files.',
          },
          { status: 400 }
        );
      }

      destinationCategoryId = body.destinationCategoryId ?? null;
      conflictStrategy = body.conflictStrategy ?? null;
      sourceBrowserHint = body.sourceBrowserHint ?? null;

      files = body.files.map(
        (f: { filename?: string; content?: string; sizeBytes?: number }) => ({
          filename: String(f.filename || ''),
          content: String(f.content || ''),
          sizeBytes: typeof f.sizeBytes === 'number' ? f.sizeBytes : undefined,
          sourceBrowserHint,
        })
      );
    }

    const preview = await createImportPreviewForOwner(auth.ownerId, {
      files,
      destinationCategoryId,
      conflictStrategy,
      sourceBrowserHint,
    });

    return NextResponse.json(preview);
  } catch (error: unknown) {
    if (error instanceof InvalidImportFileError) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_IMPORT_FILE' },
        { status: 400 }
      );
    }

    console.error('Failed to generate import preview:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate bookmark import preview.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
