import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../lib/auth/server-auth.ts';
import {
  ClassificationValidationError,
  previewClassifyUncategorizedForOwner,
  previewRuleImpactForOwner,
} from '../../../../../lib/classification/classification-service.ts';
import type { ClassificationRuleType } from '../../../../../types/bookmark.ts';

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
      mode?: 'batch' | 'rule_impact';
      includeAutoCategorized?: boolean;
      ruleType?: ClassificationRuleType;
      pattern?: string;
      categoryId?: string;
    };

    if (body.mode === 'rule_impact') {
      const impact = await previewRuleImpactForOwner(auth.ownerId, {
        ruleType: body.ruleType ?? 'hostname',
        pattern: body.pattern ?? '',
        categoryId: body.categoryId ?? '',
      });
      return NextResponse.json({ impact });
    }

    const preview = await previewClassifyUncategorizedForOwner(auth.ownerId, {
      includeAutoCategorized: Boolean(body.includeAutoCategorized),
    });

    return NextResponse.json({ preview });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to preview classification:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to preview deterministic classification.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
