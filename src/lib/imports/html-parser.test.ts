import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InvalidImportFileError,
  parseNetscapeBookmarkFiles,
  reconcileBookmarkOccurrences,
} from './html-parser.ts';
import type { BookmarkRecord } from '../../types/bookmark.ts';

const SAMPLE_CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000100" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1700000200">Engineering &amp; Architecture</H3>
        <DL><p>
            <DT><A HREF="https://github.com/user/repo1" ADD_DATE="1700000300">Repo One — Core</A>
            <DT><A HREF="https://github.com/user/repo2" ADD_DATE="1700000350">Repo Two — UI</A>
            <DT><A HREF="https://example.com/docs/guide?id=1&amp;lang=en" ADD_DATE="1700000400"></A>
        </DL><p>
        <DT><A HREF="https://youtube.com" ADD_DATE="1700000500">YouTube Home</A>
        <DT><A HREF="https://youtube.com/" ADD_DATE="1700000550">YouTube Root Slash</A>
        <DT><A HREF="https://youtube.com/watch?v=abc" ADD_DATE="1700000600">Video ABC</A>
        <DT><A HREF="https://youtube.com/watch?v=xyz" ADD_DATE="1700000650">Video XYZ</A>
        <DT><A HREF="javascript:alert('xss')" ADD_DATE="1700000700">Bookmarklet</A>
    </DL><p>
</DL><p>`;

describe('parseNetscapeBookmarkFiles & reconcileBookmarkOccurrences', () => {
  it('parses nested <DL>/<DT>/<H3> folder paths, HTML entities, timestamps, and empty titles', () => {
    const { occurrences, detectedBrowser } = parseNetscapeBookmarkFiles([
      {
        filename: 'chrome_bookmarks_2026.html',
        content: SAMPLE_CHROME_EXPORT,
      },
    ]);

    assert.equal(detectedBrowser, 'Google Chrome');
    assert.equal(occurrences.length, 8);

    // First entry: nested folder path preserved as structured string[]
    assert.deepEqual(occurrences[0].folderPath, [
      'Bookmarks bar',
      'Engineering & Architecture',
    ]);
    assert.equal(occurrences[0].originalUrl, 'https://github.com/user/repo1');
    assert.equal(occurrences[0].originalTitle, 'Repo One — Core');
    assert.equal(occurrences[0].displayTitle, 'Repo One — Core');
    assert.ok(occurrences[0].addDate?.startsWith('2023-11-'));

    // Third entry: empty <A> title preserved as "" and fallback generated from hostname + path
    assert.equal(occurrences[2].originalTitle, '');
    assert.equal(occurrences[2].hasMissingTitle, true);
    assert.equal(occurrences[2].displayTitle, 'example.com/docs/guide');
    assert.equal(
      occurrences[2].normalizedUrlKey,
      'https://example.com/docs/guide?id=1&lang=en'
    );

    // Eighth entry: unsafe javascript: scheme marked invalid without throwing
    assert.equal(occurrences[7].normalizedUrlKey, null);
    assert.ok(occurrences[7].invalidReason?.includes('Unsafe or unsupported URL scheme'));
  });

  it('reconciles intra-upload duplicates, distinct same-domain paths, and existing DB conflicts', () => {
    const { occurrences } = parseNetscapeBookmarkFiles([
      {
        filename: 'chrome_bookmarks.html',
        content: SAMPLE_CHROME_EXPORT,
      },
    ]);

    const existingBookmarks: BookmarkRecord[] = [
      {
        id: 'bm-existing-1',
        ownerId: 'owner_1',
        originalUrl: 'https://github.com/user/repo1',
        normalizedUrlKey: 'https://github.com/user/repo1',
        domain: 'github.com',
        title: 'Existing Repo One',
        description: null,
        notes: null,
        isFavorite: true,
        primaryCategoryId: 'cat-eng',
        primaryCategoryName: 'Engineering',
        parentCategoryId: null,
        parentCategoryName: null,
        categorySource: 'manual',
        categoryLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const { entries, metrics } = reconcileBookmarkOccurrences(
      occurrences,
      existingBookmarks,
      'cat-research', // different destination category -> triggers category_conflict for repo1
      1
    );

    assert.equal(metrics.totalParsedEntries, 8);
    assert.equal(metrics.invalidRecords, 1); // javascript:alert
    assert.equal(metrics.withinUploadDuplicates, 1); // youtube.com/ matches youtube.com
    assert.equal(metrics.existingDbDuplicates, 1); // github.com/user/repo1
    assert.equal(metrics.categoryConflictsCount, 1); // repo1 is in cat-eng vs destination cat-research
    assert.equal(metrics.newCanonicalBookmarks, 5); // repo2, example.com/docs/guide, youtube.com, watch?v=abc, watch?v=xyz
    assert.equal(metrics.missingTitlesCount, 1);

    // Verify repo1 vs repo2 are NOT merged by domain
    const repo1Entry = entries.find((e) =>
      e.originalUrl.includes('github.com/user/repo1')
    );
    const repo2Entry = entries.find((e) =>
      e.originalUrl.includes('github.com/user/repo2')
    );
    assert.equal(repo1Entry?.status, 'category_conflict');
    assert.equal(repo1Entry?.existingCategoryLocked, true);
    assert.equal(repo2Entry?.status, 'new');

    // Verify youtube watch?v=abc and watch?v=xyz are distinct new bookmarks
    const ytAbc = entries.find((e) => e.originalUrl.includes('watch?v=abc'));
    const ytXyz = entries.find((e) => e.originalUrl.includes('watch?v=xyz'));
    assert.equal(ytAbc?.status, 'new');
    assert.equal(ytXyz?.status, 'new');
  });

  it('deduplicates across multiple files in the same import batch', () => {
    const file1 = {
      filename: 'edge_export.html',
      content: `<DL><DT><A HREF="https://site.com/page?id=1">Page 1</A></DL>`,
    };
    const file2 = {
      filename: 'brave_export.html',
      content: `<DL><DT><A HREF="https://SITE.COM/page?id=1">Page 1 Duplicate</A><DT><A HREF="https://site.com/page?id=2">Page 2</A></DL>`,
    };

    const { occurrences } = parseNetscapeBookmarkFiles([file1, file2]);
    const { metrics } = reconcileBookmarkOccurrences(occurrences, [], null, 2);

    assert.equal(metrics.totalParsedEntries, 3);
    assert.equal(metrics.uniqueUploadIdentities, 2);
    assert.equal(metrics.withinUploadDuplicates, 1);
    assert.equal(metrics.newCanonicalBookmarks, 2);
  });

  it('rejects non-HTML, empty, or unsupported file extensions', () => {
    assert.throws(
      () =>
        parseNetscapeBookmarkFiles([
          { filename: 'bookmarks.json', content: '{"a":1}' },
        ]),
      InvalidImportFileError
    );

    assert.throws(
      () =>
        parseNetscapeBookmarkFiles([
          { filename: 'bookmarks.html', content: 'Plain text without any HTML tags' },
        ]),
      InvalidImportFileError
    );
  });
});
