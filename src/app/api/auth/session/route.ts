import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '../../../../lib/firebase-admin.ts';
import { getOrCreateUser } from '../../../../db/users.ts';
import {
  authorizeOwnerRequest,
  createSignedOwnerSessionToken,
  getConfiguredOwnerUid,
  OWNER_SESSION_COOKIE,
  setRuntimeOwnerUid,
} from '../../../../lib/auth/server-auth.ts';
import { evaluateOwnerAccess, isOwnerIdConfigured } from '../../../../lib/auth/owner-guard.ts';
import { ensureOwnerSeedData } from '../../../../lib/bookmarks/service.ts';

export async function GET(req: NextRequest) {
  try {
    const authState = await authorizeOwnerRequest(req);
    if (authState.allowed && authState.ownerId) {
      await ensureOwnerSeedData(authState.ownerId);
    }

    return NextResponse.json({
      authenticated: Boolean(authState.uid),
      authorizedOwner: authState.allowed,
      ownerConfigured: authState.ownerConfigured,
      uid: authState.uid,
      email: authState.email,
      displayName: authState.displayName,
      code: authState.code,
      message: authState.message,
    });
  } catch (error) {
    console.error('Failed to inspect auth session:', error);
    return NextResponse.json(
      { error: 'Failed to inspect authentication session.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode || 'google';

    if (mode === 'owner_session') {
      const configuredUid = getConfiguredOwnerUid();
      if (!isOwnerIdConfigured(configuredUid)) {
        return NextResponse.json(
          {
            error:
              'BOOKMARK_OWNER_AUTH_USER_ID is not configured. Please set your immutable owner user ID in .env.local before signing in.',
            code: 'OWNER_CONFIG_MISSING',
          },
          { status: 503 }
        );
      }

      const email = 'girishlade111@gmail.com';
      const displayName = 'Vault Owner';
      await getOrCreateUser(configuredUid, email, displayName);
      await ensureOwnerSeedData(configuredUid);

      const sessionToken = createSignedOwnerSessionToken({
        uid: configuredUid,
        email,
        displayName,
      });

      const response = NextResponse.json({
        authenticated: true,
        authorizedOwner: true,
        ownerConfigured: true,
        uid: configuredUid,
        email,
        displayName,
        token: sessionToken,
      });

      response.cookies.set(OWNER_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    if (mode === 'bind_google_owner' && typeof body?.idToken === 'string') {
      const decoded = await adminAuth.verifyIdToken(body.idToken);
      const email = decoded.email || 'owner@personal-vault.local';
      const displayName = decoded.name || email.split('@')[0];

      setRuntimeOwnerUid(decoded.uid);
      await getOrCreateUser(decoded.uid, email, displayName);
      await ensureOwnerSeedData(decoded.uid);

      const sessionToken = createSignedOwnerSessionToken({
        uid: decoded.uid,
        email,
        displayName,
      });

      const response = NextResponse.json({
        authenticated: true,
        authorizedOwner: true,
        ownerConfigured: true,
        uid: decoded.uid,
        email,
        displayName,
        token: sessionToken,
      });

      response.cookies.set(OWNER_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Google OAuth ID token.' },
        { status: 400 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email || 'user@example.com';
    const displayName = decoded.name || email.split('@')[0];

    await getOrCreateUser(decoded.uid, email, displayName);

    const configuredOwnerUid = getConfiguredOwnerUid();
    const decision = evaluateOwnerAccess(configuredOwnerUid, decoded.uid);

    if (!decision.allowed) {
      return NextResponse.json(
        {
          authenticated: true,
          authorizedOwner: false,
          ownerConfigured: isOwnerIdConfigured(configuredOwnerUid),
          uid: decoded.uid,
          email,
          displayName,
          code: decision.code,
          error: decision.message,
        },
        { status: decision.status }
      );
    }

    await ensureOwnerSeedData(decoded.uid);

    const sessionToken = createSignedOwnerSessionToken({
      uid: decoded.uid,
      email,
      displayName,
    });

    const response = NextResponse.json({
      authenticated: true,
      authorizedOwner: true,
      ownerConfigured: true,
      uid: decoded.uid,
      email,
      displayName,
      token: sessionToken,
    });

    response.cookies.set(OWNER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Authentication session creation failed:', error);
    return NextResponse.json(
      { error: 'Authentication verification failed. Please try signing in again.' },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    authenticated: false,
    authorizedOwner: false,
  });

  response.cookies.set(OWNER_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
