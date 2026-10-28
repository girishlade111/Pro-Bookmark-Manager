import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOwnerAccess, isOwnerIdConfigured } from './owner-guard.ts';

test('fails securely with 503 when BOOKMARK_OWNER_AUTH_USER_ID is missing or placeholder', () => {
  assert.equal(isOwnerIdConfigured(undefined), false);
  assert.equal(isOwnerIdConfigured(''), false);
  assert.equal(isOwnerIdConfigured('your_immutable_owner_auth_uid_here'), false);

  const decision = evaluateOwnerAccess('', 'user-uid-123');
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 503);
  assert.equal(decision.code, 'OWNER_CONFIG_MISSING');
});

test('rejects unauthenticated requests with 401', () => {
  const decision = evaluateOwnerAccess('owner-uid-999', null);
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 401);
  assert.equal(decision.code, 'UNAUTHENTICATED');
});

test('rejects authenticated non-owner Google accounts with 403', () => {
  const decision = evaluateOwnerAccess('owner-uid-999', 'intruder-uid-444');
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.equal(decision.code, 'FORBIDDEN_NOT_OWNER');
});

test('authorizes exact match of immutable BOOKMARK_OWNER_AUTH_USER_ID', () => {
  const decision = evaluateOwnerAccess('owner-uid-999', 'owner-uid-999');
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 200);
  assert.equal(decision.ownerId, 'owner-uid-999');
});
