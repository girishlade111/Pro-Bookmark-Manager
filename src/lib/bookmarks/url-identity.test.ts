import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBookmarkUrl,
  resolveCategoryAssignment,
  InvalidBookmarkUrlError,
} from './url-identity.ts';

test('treats bare root domain and trailing slash root domain as duplicate key', () => {
  const first = normalizeBookmarkUrl('youtube.com');
  const second = normalizeBookmarkUrl('youtube.com/');
  assert.equal(first.normalizedUrlKey, second.normalizedUrlKey);
  assert.equal(first.normalizedUrlKey, 'https://youtube.com/');
});

test('keeps root domain and video watch URL distinct (never domain-only)', () => {
  const root = normalizeBookmarkUrl('youtube.com');
  const watch = normalizeBookmarkUrl('youtube.com/watch?v=abc');
  assert.notEqual(root.normalizedUrlKey, watch.normalizedUrlKey);
});

test('keeps different query parameters on same path distinct', () => {
  const v1 = normalizeBookmarkUrl('youtube.com/watch?v=abc');
  const v2 = normalizeBookmarkUrl('youtube.com/watch?v=xyz');
  assert.notEqual(v1.normalizedUrlKey, v2.normalizedUrlKey);

  const p1 = normalizeBookmarkUrl('site.com/page?id=1');
  const p2 = normalizeBookmarkUrl('site.com/page?id=2');
  assert.notEqual(p1.normalizedUrlKey, p2.normalizedUrlKey);
});

test('keeps different repository paths on github.com distinct', () => {
  const r1 = normalizeBookmarkUrl('github.com/user/repo1');
  const r2 = normalizeBookmarkUrl('github.com/user/repo2');
  assert.notEqual(r1.normalizedUrlKey, r2.normalizedUrlKey);
});

test('preserves non-root trailing slash distinction (/a vs /a/)', () => {
  const withoutSlash = normalizeBookmarkUrl('site.com/a');
  const withSlash = normalizeBookmarkUrl('site.com/a/');
  assert.notEqual(withoutSlash.normalizedUrlKey, withSlash.normalizedUrlKey);
  assert.equal(withoutSlash.normalizedUrlKey, 'https://site.com/a');
  assert.equal(withSlash.normalizedUrlKey, 'https://site.com/a/');
});

test('preserves URL fragments (#one vs #two)', () => {
  const f1 = normalizeBookmarkUrl('site.com/p#one');
  const f2 = normalizeBookmarkUrl('site.com/p#two');
  assert.notEqual(f1.normalizedUrlKey, f2.normalizedUrlKey);
});

test('does not merge http and https or www and non-www', () => {
  const httpUrl = normalizeBookmarkUrl('http://example.com/docs');
  const httpsUrl = normalizeBookmarkUrl('https://example.com/docs');
  assert.notEqual(httpUrl.normalizedUrlKey, httpsUrl.normalizedUrlKey);

  const wwwUrl = normalizeBookmarkUrl('https://www.example.com/docs');
  assert.notEqual(httpsUrl.normalizedUrlKey, wwwUrl.normalizedUrlKey);
});

test('normalizes uppercase hostnames and default ports (:443 and :80)', () => {
  const u1 = normalizeBookmarkUrl('HTTPS://Example.COM:443/guide?utm_source=newsletter');
  const u2 = normalizeBookmarkUrl('https://example.com/guide?utm_source=newsletter');
  assert.equal(u1.normalizedUrlKey, u2.normalizedUrlKey);
});

test('rejects unsafe URL schemes such as javascript: and data:', () => {
  assert.throws(
    () => normalizeBookmarkUrl('javascript:alert(1)'),
    InvalidBookmarkUrlError
  );
  assert.throws(
    () => normalizeBookmarkUrl('data:text/html,<h1>Hi</h1>'),
    InvalidBookmarkUrlError
  );
});

test('explicitly selected category sets manual source and locks category priority', () => {
  const manual = resolveCategoryAssignment('cat-uuid-123');
  assert.equal(manual.primaryCategoryId, 'cat-uuid-123');
  assert.equal(manual.categorySource, 'manual');
  assert.equal(manual.categoryLocked, true);

  const uncategorized = resolveCategoryAssignment('');
  assert.equal(uncategorized.primaryCategoryId, null);
  assert.equal(uncategorized.categorySource, 'uncategorized');
  assert.equal(uncategorized.categoryLocked, false);
});
