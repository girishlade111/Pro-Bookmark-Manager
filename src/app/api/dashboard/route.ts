import { NextRequest, NextResponse } from 'next/server';
import { authorizeOwnerRequest } from '../../../lib/auth/server-auth.ts';
import {
  ensureOwnerSeedData,
  getDashboardSummaryForOwner,
} from '../../../lib/bookmarks/service.ts';
import { listCategoriesForOwner } from '../../../lib/categories/service.ts';

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

    const [summary, categoriesData] = await Promise.all([
      getDashboardSummaryForOwner(auth.ownerId),
      listCategoriesForOwner(auth.ownerId),
    ]);

    return NextResponse.json({
      summary,
      categories: categoriesData,
    });
  } catch (error: unknown) {
    console.error('Failed to fetch dashboard data:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load dashboard data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
