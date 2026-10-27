// Pure helpers (plain JS so `node --test` and the pull script can import them without a build step).

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build keyword matchers: { topicId: RegExp[] } */
export function buildMatchers(topics) {
  return Object.fromEntries(
    topics.map((t) => [
      t.id,
      (t.keywords || []).map((w) => new RegExp(`(^|[^a-z0-9])${escape(w.trim())}(s|es|ing|ed)?($|[^a-z0-9])`, 'i')),
    ]),
  );
}

/** Title hit, or 2+ description hits, tags a topic. */
export function tagWith(matchers, title = '', description = '') {
  const out = [];
  for (const [id, res] of Object.entries(matchers)) {
    const t = res.filter((r) => r.test(title)).length;
    const d = res.filter((r) => r.test(description)).length;
    if (t > 0 || d >= 2) out.push(id);
  }
  return out;
}

/** Topics for one video: stored tags (hand fixes win) plus fresh keyword matches. */
export function videoTopics(v, matchers, known) {
  const set = new Set((v.topics || []).filter((id) => known.has(id)));
  for (const id of tagWith(matchers, v.title, v.description)) set.add(id);
  return [...set];
}

/** Count videos per topic. */
export function countTopics(videos, topics) {
  const matchers = buildMatchers(topics);
  const known = new Set(topics.map((t) => t.id));
  const counts = Object.fromEntries(topics.map((t) => [t.id, 0]));
  for (const v of videos) for (const id of videoTopics(v, matchers, known)) counts[id]++;
  return counts;
}

/**
 * Pick home quest cards: top `max` topics by count (ties: most recent post, then topics.json order).
 * Topics with 0 posts never show; if fewer than `min` have posts, pad from `fallback`.
 */
export function pickQuestTopics(videos, cfg) {
  const { topics, questCards: { max = 4, min = 3, fallback = [] } = {} } = cfg;
  const counts = countTopics(videos, topics);
  const matchers = buildMatchers(topics);
  const known = new Set(topics.map((t) => t.id));
  const latest = {};
  for (const v of videos) for (const id of videoTopics(v, matchers, known)) if (!latest[id] || v.published > latest[id]) latest[id] = v.published;
  const order = new Map(topics.map((t, i) => [t.id, i]));
  const ranked = topics
    .filter((t) => counts[t.id] > 0)
    .sort((a, b) => counts[b.id] - counts[a.id] || (latest[b.id] || '').localeCompare(latest[a.id] || '') || order.get(a.id) - order.get(b.id))
    .slice(0, max);
  for (const id of fallback) {
    if (ranked.length >= min) break;
    const t = topics.find((x) => x.id === id);
    if (t && !ranked.includes(t)) ranked.push(t);
  }
  return ranked.map((t) => ({ ...t, count: counts[t.id] }));
}
