import cfg from '../data/topics.json';
// @ts-ignore plain JS helper shared with node scripts/tests
import { pickQuestTopics, buildMatchers, videoTopics } from './quest-topics.mjs';
import { allVideos } from './videos';

export interface TopicDef { id: string; label: string; icon: string; color: string[]; blurb: string; keywords: string[]; count?: number }
export const topics = cfg.topics as TopicDef[];
const matchers = buildMatchers(topics);
const known = new Set(topics.map((t) => t.id));
export const topicsOf = (v: { topics?: string[]; title: string; description: string }): string[] => videoTopics(v, matchers, known);
export const topicLabel = (id: string) => topics.find((t) => t.id === id)?.label ?? id;
export const topicStyle = (id: string) => {
  const t = topics.find((x) => x.id === id);
  return t ? `--t1:${t.color[0]};--t2:${t.color[1]}` : '';
};
export const questTopics: TopicDef[] = pickQuestTopics(allVideos, cfg);
/** Filter chips: every topic with at least one video; fallback topics while the channel is empty. */
const used = new Set(allVideos.flatMap((v) => topicsOf(v)));
export const filterTopics: TopicDef[] = used.size ? topics.filter((t) => used.has(t.id)) : topics.filter((t) => cfg.questCards.fallback.includes(t.id));
