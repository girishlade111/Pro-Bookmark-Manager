'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { KeyRound, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { auth, googleAuthProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingOwnerSession, setLoadingOwnerSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unmatchedGoogleUid, setUnmatchedGoogleUid] = useState<string | null>(
    null
  );
  const [pendingIdToken, setPendingIdToken] = useState<string | null>(null);
  const [ownerConfigured, setOwnerConfigured] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.ownerConfigured === 'boolean') {
          setOwnerConfigured(data.ownerConfigured);
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setUnmatchedGoogleUid(null);
    setLoadingGoogle(true);

    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'google', idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.uid) {
          setUnmatchedGoogleUid(data.uid);
          setPendingIdToken(idToken);
        }
        setErrorMessage(
          data.error || 'Google Sign-In failed single-owner verification.'
        );
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Google Sign-In popup was closed or blocked by the browser.'
      );
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleBindGoogleAsOwner = async () => {
    if (!pendingIdToken) return;
    setLoadingGoogle(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'bind_google_owner',
          idToken: pendingIdToken,
        }),
      });
      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Failed to bind Google UID.');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleOwnerSessionSignIn = async () => {
    setErrorMessage(null);
    setLoadingOwnerSession(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'owner_session' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(
          data.error || 'Owner session initialization failed.'
        );
        return;
      }
      router.push('/dashboard');
    } catch {
      setErrorMessage('Network error while establishing owner session.');
    } finally {
      setLoadingOwnerSession(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Lock className="h-4 w-4" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Personal Bookmark Vault
            </h1>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Private, single-owner cloud bookmark manager. Access is strictly restricted to the configured immutable owner user ID (<code className="font-mono text-slate-700">BOOKMARK_OWNER_AUTH_USER_ID</code>).
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-2"
          >
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>

            {unmatchedGoogleUid && (
              <div className="pl-6 space-y-2 text-red-700">
                <p className="font-mono text-[11px] break-all">
                  Your Google Auth UID: {unmatchedGoogleUid}
                </p>
                <p>
                  To authorize this Google account in <code className="font-mono">.env.local</code>, set{' '}
                  <code className="font-mono">
                    BOOKMARK_OWNER_AUTH_USER_ID={unmatchedGoogleUid}
                  </code>{' '}
                  or bind it for the active server session below:
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleBindGoogleAsOwner}
                >
                  Authorize & Lock My Google UID ({unmatchedGoogleUid.slice(0, 8)}…)
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loadingGoogle || loadingOwnerSession}
            className="w-full"
          >
            <KeyRound className="h-4 w-4" />
            {loadingGoogle ? 'Verifying Google OAuth...' : 'Sign in with Google OAuth'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleOwnerSessionSignIn}
            disabled={loadingGoogle || loadingOwnerSession || !ownerConfigured}
            className="w-full"
          >
            <ShieldCheck className="h-4 w-4" />
            {loadingOwnerSession
              ? 'Authenticating Owner Vault...'
              : 'Continue with Configured Owner ID'}
          </Button>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>Single-Owner Guard</span>
            <span className="font-mono text-slate-700">
              {ownerConfigured ? 'BOOKMARK_OWNER_AUTH_USER_ID active' : 'Unconfigured'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            Email addresses are never used for authorization. Only the immutable authenticated user ID is accepted by server-side API routes.
          </p>
        </div>
      </div>
    </div>
  );
}
