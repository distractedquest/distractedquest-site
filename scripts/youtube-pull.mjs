#!/usr/bin/env node
// Pulls the Distracted Quest YouTube channel feed (no API key) and MERGES new uploads into
// src/data/videos.json. Older videos stay even after they fall off the 15-item feed.
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
const dryRun = process.argv.includes('--dry-run');
const UA = 'Mozilla/5.0 (compatible; distractedquest-site-bot/1.0; +https://distractedquest.com)';

const site = JSON.parse(await readFile(SITE, 'utf8'));
const channelId = process.env.YT_CHANNEL_ID || site.youtubeChannelId;
if (!/^UC[\w-]{22}$/.test(channelId)) throw new Error(`Bad channel id: ${channelId}`);
const shortsPlaylist = 'UUSH' + channelId.slice(2);

const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`)); return m ? decode(m[1]) : ''; };

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

function parseEntries(xml) {
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

async function probeShort(id) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA } });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
  } catch {}
  return null; // unknown
}

const slugify = (s) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'video';

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
    if (usedSlugs.has(slug)) slug = `${slug}-${f.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
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

const next = [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
const out = JSON.stringify(next, null, 2) + '\n';
const before = await readFile(VIDEOS, 'utf8').catch(() => '');
if (out === before) { console.log('videos.json unchanged.'); process.exit(0); }
if (dryRun) { console.log(`[dry-run] would write ${next.length} videos (+${added}, ~${updated}).`); process.exit(0); }
await writeFile(VIDEOS, out);
console.log(`videos.json updated: ${next.length} total (+${added} new, ${updated} updated).`);
