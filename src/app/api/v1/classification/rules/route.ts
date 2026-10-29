import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../../../lib/auth/server-auth.ts';
import {
  applyClassifyUncategorizedForOwner,
  ClassificationValidationError,
  createClassificationRuleForOwner,
  getClassificationOverviewForOwner,
  listClassificationRulesForOwner,
} from '../../../../../lib/classification/classification-service.ts';
import type { ClassificationRuleType } from '../../../../../types/bookmark.ts';

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const [rules, stats] = await Promise.all([
      listClassificationRulesForOwner(auth.ownerId),
      getClassificationOverviewForOwner(auth.ownerId),
    ]);

    return NextResponse.json({ rules, stats });
  } catch (error: unknown) {
    console.error('Failed to list classification rules:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load classification rules.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeOwnerRequest(req);
    if (!auth.allowed || !auth.ownerId) {
      return NextResponse.json(
        { error: auth.message, code: auth.code },
        { status: auth.status }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      name?: string;
      ruleType?: ClassificationRuleType;
      pattern?: string;
      categoryId?: string;
      priority?: number;
      confidence?: number;
      applyToUnlockedNow?: boolean;
    } | null;

    if (!body || !body.ruleType || !body.pattern || !body.categoryId) {
      return NextResponse.json(
        { error: 'ruleType, pattern, and categoryId are required.' },
        { status: 400 }
      );
    }

    const rule = await createClassificationRuleForOwner(auth.ownerId, {
      name: body.name,
      ruleType: body.ruleType,
      pattern: body.pattern,
      categoryId: body.categoryId,
      priority: body.priority,
      confidence: body.confidence,
    });

    let appliedOutcome = null;
    if (body.applyToUnlockedNow) {
      appliedOutcome = await applyClassifyUncategorizedForOwner(auth.ownerId, {
        includeAutoCategorized: true,
      });
    }

    const stats = await getClassificationOverviewForOwner(auth.ownerId);

    return NextResponse.json({ rule, appliedOutcome, stats }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ClassificationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to create classification rule:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create classification rule.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
