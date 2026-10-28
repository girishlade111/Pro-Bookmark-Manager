import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { adminAuth } from '../firebase-admin.ts';
import { getOrCreateUser } from '../../db/users.ts';
import { evaluateOwnerAccess, isOwnerIdConfigured, OwnerAccessDecision } from './owner-guard.ts';

export const OWNER_SESSION_COOKIE = 'pvbm_owner_session';

declare global {
  var _runtimeOwnerUidOverride: string | undefined;
}

export function getConfiguredOwnerUid(): string {
  return (
    global._runtimeOwnerUidOverride ||
    process.env.BOOKMARK_OWNER_AUTH_USER_ID ||
    'owner_vault_83e500e6'
  ).trim();
}

export function setRuntimeOwnerUid(uid: string): void {
  global._runtimeOwnerUidOverride = uid.trim();
  process.env.BOOKMARK_OWNER_AUTH_USER_ID = uid.trim();
}

function getSigningSecret(): string {
  return (
    process.env.SQL_PASSWORD ||
    process.env.BOOKMARK_OWNER_AUTH_USER_ID ||
    'pvbm-local-hmac-key-83e500e6'
  );
}

export interface SessionTokenPayload {
  uid: string;
  email: string;
  displayName: string;
  iat: number;
  exp: number;
}

export function createSignedOwnerSessionToken(payload: {
  uid: string;
  email: string;
  displayName: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionTokenPayload = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString(
    'base64url'
  );
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `owner_session.${encoded}.${signature}`;
}

export function verifySignedOwnerSessionToken(
  token: string
): SessionTokenPayload | null {
  if (!token.startsWith('owner_session.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    ) as SessionTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function verifyRequestUser(req?: NextRequest): Promise<{
  uid: string | null;
  email: string | null;
  displayName: string | null;
}> {
  let rawToken: string | null = null;

  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.slice('Bearer '.length).trim();
    }
    if (!rawToken) {
      rawToken = req.cookies.get(OWNER_SESSION_COOKIE)?.value ?? null;
    }
  }

  if (!rawToken) {
    try {
      const cookieStore = await cookies();
      rawToken = cookieStore.get(OWNER_SESSION_COOKIE)?.value ?? null;
    } catch {
      // Ignore if outside request context
    }
  }

  if (!rawToken) {
    return { uid: null, email: null, displayName: null };
  }

  const signedSession = verifySignedOwnerSessionToken(rawToken);
  if (signedSession) {
    return {
      uid: signedSession.uid,
      email: signedSession.email,
      displayName: signedSession.displayName,
    };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(rawToken);
    const email = decoded.email || 'owner@personal-vault.local';
    const displayName = decoded.name || email.split('@')[0];
    await getOrCreateUser(decoded.uid, email, displayName);
    return {
      uid: decoded.uid,
      email,
      displayName,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { uid: null, email: null, displayName: null };
  }
}

export async function authorizeOwnerRequest(req?: NextRequest): Promise<
  OwnerAccessDecision & {
    uid: string | null;
    email: string | null;
    displayName: string | null;
    ownerConfigured: boolean;
  }
> {
  const configuredOwnerUid = getConfiguredOwnerUid();
  const ownerConfigured = isOwnerIdConfigured(configuredOwnerUid);
  const user = await verifyRequestUser(req);
  const decision = evaluateOwnerAccess(configuredOwnerUid, user.uid);

  return {
    ...decision,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    ownerConfigured,
  };
}
