#!/usr/bin/env node
// Pulls the Distracted Quest YouTube channel feed (no API key) and MERGES new uploads into
// src/data/videos.json. Older videos stay even after they fall off the 15-item feed.
// Exception: if a video is deleted and re-uploaded under a new id with the same title,
// the dead catalog entry is dropped and the live upload reclaims the clean slug (with a
// redirect from any suffix slug the merge had to invent).
// - Shorts: detected from /shorts/ links, the channel's Shorts playlist feed (UUSH...),
//   or by probing youtube.com/shorts/<id> (200 = Short, redirect = regular video).
// - Topics: keyword tagging on first sight only (manual fixes in videos.json are kept).
// - Writes the file only when something actually changed (so the workflow commits only then).
// - Feed outages / a channel with no public videos yet => no change, exit 0.
// Usage: node scripts/youtube-pull.mjs [--dry-run]   (env YT_CHANNEL_ID overrides site.json)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tagTopics } from './topics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEOS = path.join(root, 'src/data/videos.json');
const SITE = path.join(root, 'src/data/site.json');
const REDIRECTS = path.join(root, 'public/_redirects');
const VIDEO_REDIRECT_MARK = '# Video slug redirects (managed by youtube-pull.mjs)';
export const UA = 'Mozilla/5.0 (compatible; distractedquest-site-bot/1.0; +https://distractedquest.com)';

export const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`)); return m ? decode(m[1]) : ''; };

export const slugify = (s) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'video';

export const suffixSlug = (base, id) =>
  `${base}-${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;

export function parseEntries(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const id = tag(e, 'yt:videoId');
    const link = attr(e, 'link', 'href');
    return {
      id,
      title: tag(e, 'title') || tag(e, 'media:title'),
      description: tag(e, 'media:description'),
      published: tag(e, 'published'),
      updated: tag(e, 'updated'),
      thumbnail: attr(e, 'media:thumbnail', 'url') || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      linkIsShort: /\/shorts\//.test(link),
    };
  }).filter((v) => v.id);
}

/** Catalog ids that share a title with a still-in-feed sibling but are themselves absent from the feed. */
export function candidateRemovedIds(videos, feedIds) {
  const byTitle = new Map();
  for (const v of videos) {
    const key = v.title.trim();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(v);
  }
  const candidates = [];
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    const inFeed = group.some((v) => feedIds.has(v.id));
    if (!inFeed) continue;
    for (const v of group) {
      if (!feedIds.has(v.id)) candidates.push(v.id);
    }
  }
  return candidates;
}

/**
 * Drop catalog entries confirmed removed when a same-title live upload exists
 * (YouTube re-upload). Give the newest live video the clean slugify(title) slug
 * if a removed sibling was holding it, and return redirects from vacated slugs.
 */
export function reclaimReplacedUploads(videos, removedIds) {
  const removed = new Set(removedIds);
  const byTitle = new Map();
  for (const v of videos) {
    const key = v.title.trim();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(v);
  }
  const dropIds = new Set();
  const slugById = new Map();
  const redirects = [];

  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    const dead = group.filter((v) => removed.has(v.id));
    const live = group.filter((v) => !removed.has(v.id));
    if (!dead.length || !live.length) continue;
    live.sort((a, b) => b.published.localeCompare(a.published));
    const keeper = live[0];
    const preferred = slugify(keeper.title);
    for (const d of dead) dropIds.add(d.id);
    const preferredTakenByLive = videos.some((v) => v.slug === preferred && !dropIds.has(v.id) && v.id !== keeper.id);
    if (keeper.slug !== preferred && !preferredTakenByLive) {
      redirects.push({ from: keeper.slug, to: preferred });
      slugById.set(keeper.id, preferred);
    }
  }

  const next = videos
    .filter((v) => !dropIds.has(v.id))
    .map((v) => (slugById.has(v.id) ? { ...v, slug: slugById.get(v.id) } : v));
  return { videos: next, redirects, dropped: [...dropIds] };
}

export function upsertVideoRedirects(text, redirects) {
  const lines = (text || '').replace(/\s+$/, '').split('\n');
  const map = new Map();
  const kept = [];
  let inManaged = false;
  for (const line of lines) {
    if (line.trim() === VIDEO_REDIRECT_MARK) {
      inManaged = true;
      continue;
    }
    if (inManaged) {
      const m = line.match(/^\/videos\/(\S+)\s+\/videos\/(\S+)\s+301\s*$/);
      if (m) {
        map.set(m[1], m[2]);
        continue;
      }
      if (line.trim() === '') continue;
      inManaged = false;
      kept.push(line);
      continue;
    }
    kept.push(line);
  }
  for (const { from, to } of redirects) {
    if (from && to && from !== to) map.set(from, to);
  }
  if (map.size === 0) return kept.join('\n') + '\n';
  const managed = [VIDEO_REDIRECT_MARK, ...[...map.entries()].map(([f, t]) => `/videos/${f} /videos/${t} 301`)];
  const body = kept.join('\n').replace(/\s+$/, '');
  return `${body}\n\n${managed.join('\n')}\n`;
}

export async function isRemovedUpload(id, fetchImpl = fetch) {
  try {
    const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetchImpl(oembed, { headers: { 'User-Agent': UA } });
    if (res.ok) return false;
    if (res.status === 404) return true;
    if (res.status !== 401 && res.status !== 403) return false;
    const watch = await fetchImpl(`https://www.youtube.com/watch?v=${id}`, { headers: { 'User-Agent': UA } });
    const text = await watch.text();
    const error = /"playabilityStatus":\{"status":"ERROR"/.test(text);
    const reason = /This video has been removed by the uploader|This video is private|Private video|This video isn't available anymore/i.test(text);
    return error && reason;
  } catch {
    return false;
  }
}

async function fetchFeed(param) {
  const url = `https://www.youtube.com/feeds/videos.xml?${param}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.text();
      // 404 = channel/playlist has no public videos (or YouTube's feed is flaky). 5xx = retry.
      if (res.status === 404 && attempt === 3) return null;
      console.warn(`feed ${param} -> HTTP ${res.status} (attempt ${attempt})`);
    } catch (e) {
      console.warn(`feed ${param} -> ${e.message} (attempt ${attempt})`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return null;
}

async function probeShort(id) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA } });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
  } catch {}
  return null; // unknown
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const site = JSON.parse(await readFile(SITE, 'utf8'));
  const channelId = process.env.YT_CHANNEL_ID || site.youtubeChannelId;
  if (!/^UC[\w-]{22}$/.test(channelId)) throw new Error(`Bad channel id: ${channelId}`);
  const shortsPlaylist = 'UUSH' + channelId.slice(2);

  const existing = JSON.parse(await readFile(VIDEOS, 'utf8').catch(() => '[]'));
  const byId = new Map(existing.map((v) => [v.id, v]));
  const usedSlugs = new Set(existing.map((v) => v.slug));

  const [mainXml, shortsXml] = await Promise.all([fetchFeed(`channel_id=${channelId}`), fetchFeed(`playlist_id=${shortsPlaylist}`)]);
  const shortIds = new Set(parseEntries(shortsXml).map((v) => v.id));
  const feedItems = new Map();
  for (const v of [...parseEntries(mainXml), ...parseEntries(shortsXml)]) feedItems.set(v.id, v);

  if (feedItems.size === 0) {
    console.log(`No feed items for ${channelId} (no public videos yet, or feed unavailable). Nothing to do.`);
    process.exit(0);
  }

  let added = 0, updated = 0;
  for (const f of feedItems.values()) {
    const cur = byId.get(f.id);
    if (!cur) {
      let isShort = f.linkIsShort || shortIds.has(f.id);
      if (!isShort && shortsXml === null) isShort = (await probeShort(f.id)) ?? false;
      let slug = slugify(f.title);
      if (usedSlugs.has(slug)) slug = suffixSlug(slug, f.id);
      usedSlugs.add(slug);
      const v = { id: f.id, slug, title: f.title, description: f.description, published: f.published, updated: f.updated, thumbnail: f.thumbnail, isShort, topics: tagTopics(f.title, f.description) };
      byId.set(f.id, v);
      added++;
      console.log(`+ ${isShort ? 'short' : 'video'} ${f.id} "${f.title}" [${v.topics.join(', ') || 'untagged'}]`);
    } else {
      // Keep slug, topics and isShort (may be hand-edited); refresh text/thumbnail if YouTube changed them.
      let changed = false;
      for (const k of ['title', 'description', 'thumbnail']) {
        if (f[k] && cur[k] !== f[k]) { cur[k] = f[k]; changed = true; }
      }
      if (changed) { cur.updated = f.updated || cur.updated; updated++; console.log(`~ ${f.id} "${cur.title}"`); }
      if (!cur.isShort && (f.linkIsShort || shortIds.has(f.id))) { cur.isShort = true; updated++; }
    }
  }

  let next = [...byId.values()];
  const candidates = candidateRemovedIds(next, new Set(feedItems.keys()));
  const removed = [];
  for (const id of candidates) {
    if (await isRemovedUpload(id)) removed.push(id);
  }
  const reclaimed = reclaimReplacedUploads(next, removed);
  for (const id of reclaimed.dropped) {
    console.log(`- dropped removed upload ${id} (replaced by a same-title live video)`);
  }
  for (const r of reclaimed.redirects) {
    console.log(`> slug ${r.from} -> ${r.to}`);
  }
  next = reclaimed.videos.sort((a, b) => b.published.localeCompare(a.published));

  const out = JSON.stringify(next, null, 2) + '\n';
  const before = await readFile(VIDEOS, 'utf8').catch(() => '');
  const videosChanged = out !== before;

  let redirectsText = null;
  if (reclaimed.redirects.length) {
    const current = await readFile(REDIRECTS, 'utf8').catch(() => '');
    const updatedRedirects = upsertVideoRedirects(current, reclaimed.redirects);
    if (updatedRedirects !== current) redirectsText = updatedRedirects;
  }

  if (!videosChanged && !redirectsText) { console.log('videos.json unchanged.'); process.exit(0); }
  if (dryRun) {
    console.log(`[dry-run] would write ${next.length} videos (+${added}, ~${updated}, -${reclaimed.dropped.length})${redirectsText ? ' and update redirects' : ''}.`);
    process.exit(0);
  }
  if (videosChanged) {
    await writeFile(VIDEOS, out);
    console.log(`videos.json updated: ${next.length} total (+${added} new, ${updated} updated, ${reclaimed.dropped.length} dropped).`);
  }
  if (redirectsText) {
    await writeFile(REDIRECTS, redirectsText);
    console.log('public/_redirects updated with reclaimed video slugs.');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
