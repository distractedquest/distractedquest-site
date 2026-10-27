import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickQuestTopics, countTopics } from '../src/lib/quest-topics.mjs';
import { tagTopics } from '../scripts/topics.mjs';

const cfg = JSON.parse(readFileSync(new URL('../src/data/topics.json', import.meta.url), 'utf8'));
const v = (title, published = '2026-10-01', topics = [], description = '') => ({ title, description, published, topics });
const ids = (xs) => xs.map((t) => t.id);

test('no videos -> fallback Fishing, Kayaks, Homelab', () => {
  assert.deepEqual(ids(pickQuestTopics([], cfg)), ['fishing', 'kayaks', 'homelab']);
});

test('ranks by post count and caps at 4', () => {
  const vids = [
    v('Smoked brisket on the offset'), v('Pork ribs low and slow'), v('BBQ sauce test'),
    v('Starship launch watch party'), v('Falcon 9 liftoff'),
    v('Range day with a new pistol'),
    v('Proxmox homelab rebuild'),
    v('Crappie fishing at dawn'),
  ];
  const got = ids(pickQuestTopics(vids, cfg));
  assert.equal(got.length, 4);
  assert.deepEqual(got.slice(0, 2), ['bbq', 'space']);
});

test('pads with fallback when fewer than 3 topics have posts', () => {
  assert.deepEqual(ids(pickQuestTopics([v('Brisket night')], cfg)), ['bbq', 'fishing', 'kayaks']);
});

test('ties break by most recent post', () => {
  const got = ids(pickQuestTopics([v('Cigar on the porch', '2026-09-01'), v('Xbox gameplay', '2026-10-20')], cfg));
  assert.deepEqual(got.slice(0, 2), ['gaming', 'cigars']);
});

test('stored hand tags count even without keywords', () => {
  assert.equal(countTopics([v('Untitled', '2026-10-01', ['space'])], cfg.topics).space, 1);
});

test('keyword tagging covers new topics', () => {
  assert.deepEqual(tagTopics('Kayak fishing for bass'), ['fishing', 'kayaks']);
  assert.ok(tagTopics('Waymo robotaxi ride').includes('autonomous'));
  assert.ok(tagTopics('New humidor and a Padron cigar').includes('cigars'));
});
