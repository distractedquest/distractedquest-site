import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  suffixSlug,
  candidateRemovedIds,
  reclaimReplacedUploads,
  upsertVideoRedirects,
  isRemovedUpload,
  parseEntries,
} from '../scripts/youtube-pull.mjs';

const TITLE = 'Sunrise Launch, Sunfish & a Creek Run | First Cold Front Kayak Trip';
const CLEAN = 'sunrise-launch-sunfish-and-a-creek-run-first-cold-front-kayak-trip';

test('slugify turns & and | into a single clean slug', () => {
  assert.equal(slugify(TITLE), CLEAN);
  assert.equal(suffixSlug(CLEAN, '0N93oKAAJsY'), `${CLEAN}-0n93ok`);
});

test('candidateRemovedIds only flags same-title siblings missing from the feed', () => {
  const videos = [
    { id: 'live', title: TITLE, slug: `${CLEAN}-0n93ok`, published: '2026-11-04T21:52:23+00:00' },
    { id: 'dead', title: TITLE, slug: CLEAN, published: '2026-11-04T16:32:31+00:00' },
    { id: 'other', title: 'A different video', slug: 'a-different-video', published: '2026-11-01T00:00:00+00:00' },
  ];
  assert.deepEqual(candidateRemovedIds(videos, new Set(['live', 'other'])), ['dead']);
  assert.deepEqual(candidateRemovedIds(videos, new Set(['live', 'dead'])), []);
  assert.deepEqual(candidateRemovedIds(videos, new Set(['other'])), []);
});

test('reclaimReplacedUploads drops the removed upload and restores the clean slug', () => {
  const videos = [
    { id: '0N93oKAAJsY', title: TITLE, slug: `${CLEAN}-0n93ok`, published: '2026-11-04T21:52:23+00:00' },
    { id: 'r5AxlFnUoeA', title: TITLE, slug: CLEAN, published: '2026-11-04T16:32:31+00:00' },
    { id: 'keep', title: 'Unrelated', slug: 'unrelated', published: '2026-10-01T00:00:00+00:00' },
  ];
  const got = reclaimReplacedUploads(videos, ['r5AxlFnUoeA']);
  assert.deepEqual(got.dropped, ['r5AxlFnUoeA']);
  assert.deepEqual(got.redirects, [{ from: `${CLEAN}-0n93ok`, to: CLEAN }]);
  assert.equal(got.videos.length, 2);
  assert.equal(got.videos.find((v) => v.id === '0N93oKAAJsY').slug, CLEAN);
  assert.ok(got.videos.find((v) => v.id === 'keep'));
});

test('reclaimReplacedUploads leaves same-title videos alone when none are removed', () => {
  const videos = [
    { id: 'a', title: TITLE, slug: `${CLEAN}-aaaaaa`, published: '2026-11-05T00:00:00+00:00' },
    { id: 'b', title: TITLE, slug: CLEAN, published: '2026-11-04T00:00:00+00:00' },
  ];
  const got = reclaimReplacedUploads(videos, []);
  assert.deepEqual(got.dropped, []);
  assert.deepEqual(got.redirects, []);
  assert.equal(got.videos.length, 2);
});

test('upsertVideoRedirects appends a managed block without duplicating', () => {
  const base = '# legal\n/privacy-policy /privacy  301\n';
  const once = upsertVideoRedirects(base, [{ from: `${CLEAN}-0n93ok`, to: CLEAN }]);
  assert.match(once, /# Video slug redirects \(managed by youtube-pull.mjs\)/);
  assert.match(once, new RegExp(`/videos/${CLEAN}-0n93ok /videos/${CLEAN} 301`));
  const twice = upsertVideoRedirects(once, [{ from: `${CLEAN}-0n93ok`, to: CLEAN }]);
  assert.equal(twice, once);
});

test('parseEntries decodes titles that contain & and |', () => {
  const xml = `<?xml version="1.0"?><feed><entry>
    <yt:videoId>0N93oKAAJsY</yt:videoId>
    <title>Sunrise Launch, Sunfish &amp; a Creek Run | First Cold Front Kayak Trip</title>
    <published>2026-11-04T21:52:23+00:00</published>
    <updated>2026-11-04T21:52:24+00:00</updated>
    <link rel="alternate" href="https://www.youtube.com/watch?v=0N93oKAAJsY"/>
    <media:group>
      <media:title>Sunrise Launch, Sunfish &amp; a Creek Run | First Cold Front Kayak Trip</media:title>
      <media:description>desc</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/0N93oKAAJsY/hqdefault.jpg"/>
    </media:group>
  </entry></feed>`;
  const [v] = parseEntries(xml);
  assert.equal(v.id, '0N93oKAAJsY');
  assert.equal(v.title, TITLE);
  assert.equal(v.linkIsShort, false);
});

test('isRemovedUpload treats oEmbed 200 as live and 404 as removed', async () => {
  const fake = async (url) => {
    if (url.includes('oembed') && url.includes('liveid12345')) return { ok: true, status: 200, text: async () => '{}' };
    if (url.includes('oembed') && url.includes('goneid12345')) return { ok: false, status: 404, text: async () => '' };
    throw new Error(`unexpected ${url}`);
  };
  assert.equal(await isRemovedUpload('liveid12345', fake), false);
  assert.equal(await isRemovedUpload('goneid12345', fake), true);
});

test('isRemovedUpload confirms a 403 only when the watch page says the uploader removed it', async () => {
  const fake = async (url) => {
    if (url.includes('oembed')) return { ok: false, status: 403, text: async () => '' };
    if (url.includes('watch?v=r5AxlFnUoeA')) {
      return {
        ok: true,
        status: 200,
        text: async () => '{"playabilityStatus":{"status":"ERROR","reason":"Video unavailable"},"description":{"content":"This video has been removed by the uploader"}}',
      };
    }
    if (url.includes('watch?v=embedoff123')) {
      return { ok: true, status: 200, text: async () => '{"playabilityStatus":{"status":"OK"}}' };
    }
    throw new Error(`unexpected ${url}`);
  };
  assert.equal(await isRemovedUpload('r5AxlFnUoeA', fake), true);
  assert.equal(await isRemovedUpload('embedoff123', fake), false);
});
