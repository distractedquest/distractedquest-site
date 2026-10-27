import realVideos from '../data/videos.json';
import demoVideos from '../data/videos.demo.json';

export type Topic = string; // ids from src/data/topics.json

export interface Video {
  id: string;            // YouTube video id
  slug: string;          // stable URL slug for /videos/[slug]
  title: string;
  description: string;
  published: string;     // ISO date
  updated?: string;
  thumbnail: string;
  isShort: boolean;
  topics: Topic[];
  duration?: string;     // optional ISO 8601 duration (PT7M30S) for VideoObject
}

// DQ_DEMO=1 renders sample cards (design preview / screenshots only). Never set in production.
const useDemo = import.meta.env.DQ_DEMO === '1' || process.env.DQ_DEMO === '1';

export const allVideos: Video[] = ((useDemo ? demoVideos : realVideos) as Video[])
  .slice()
  .sort((a, b) => b.published.localeCompare(a.published));

export const longVideos = allVideos.filter((v) => !v.isShort);
export const shorts = allVideos.filter((v) => v.isShort);
export const isDemo = useDemo;

export const watchUrl = (v: Video) =>
  v.isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;

export const embedUrl = (v: Video) => `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

export const excerpt = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};
