// Keyword topic tagging. A video can have several topics. Fix a wrong tag by editing
// src/data/videos.json directly: existing entries are never re-tagged by the pull script.
export const TOPIC_KEYWORDS = {
  fishing: [
    'fish', 'fishing', 'bass', 'sunfish', 'crappie', 'catfish', 'perch', 'bluegill', 'trout', 'redfish', 'drum',
    'lure', 'bait', 'hook', 'hooked', 'catch', 'caught', 'angler', 'rig', 'texas rig', 'ned rig', 'jig',
    'crankbait', 'swimbait', 'worm', 'paddle tail', 'topwater', 'spinnerbait', 'rod', 'reel', 'graph', 'fish finder',
  ],
  kayaks: [
    'kayak', 'kayaking', 'yak', 'paddle', 'paddling', 'canoe', 'creek', 'river run', 'launch', 'on the water',
    'pedal drive', 'sit on top',
  ],
  homelab: [
    'homelab', 'home lab', 'esxi', 'vmware', 'proxmox', 'server', 'rack', 'docker', 'container', 'kubernetes',
    'nas', 'truenas', 'unraid', 'self-host', 'self host', 'selfhost', 'cloudflare', 'tunnel', 'vm ', 'virtual machine',
    'network', 'unifi', 'pfsense', 'opnsense', 'plex', 'jellyfin', 'postiz', 'linux', 'raspberry pi',
  ],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchers = Object.fromEntries(
  Object.entries(TOPIC_KEYWORDS).map(([topic, words]) => [
    topic,
    words.map((w) => new RegExp(`(^|[^a-z0-9])${escape(w.trim())}(s|es|ing|ed)?($|[^a-z0-9])`, 'i')),
  ]),
);

/** Title matches count double; a topic needs a title hit or 2+ description hits. */
export function tagTopics(title = '', description = '') {
  const out = [];
  for (const [topic, res] of Object.entries(matchers)) {
    const t = res.filter((r) => r.test(title)).length;
    const d = res.filter((r) => r.test(description)).length;
    if (t > 0 || d >= 2) out.push(topic);
  }
  return out;
}
