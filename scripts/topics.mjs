// Keyword topic tagging, driven by src/data/topics.json. A video can have several topics.
// Fix a wrong tag by editing src/data/videos.json directly: existing entries are never re-tagged by the pull script.
import { readFileSync } from 'node:fs';
import { buildMatchers, tagWith } from '../src/lib/quest-topics.mjs';

const cfg = JSON.parse(readFileSync(new URL('../src/data/topics.json', import.meta.url), 'utf8'));
export const TOPIC_KEYWORDS = Object.fromEntries(cfg.topics.map((t) => [t.id, t.keywords]));
const matchers = buildMatchers(cfg.topics);

/** Title matches count; a topic needs a title hit or 2+ description hits. */
export function tagTopics(title = '', description = '') {
  return tagWith(matchers, title, description);
}
