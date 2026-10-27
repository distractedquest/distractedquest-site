# distractedquest.com

Static [Astro](https://astro.build) site for **Distracted Quest** (fishing, kayaks, homelab), hosted free on
**Cloudflare Workers static assets** and deployed automatically from GitHub.

| Path | What |
|---|---|
| `/` | Home: hero, latest videos, latest Shorts, topic tiles, photo strip |
| `/links` | Link-in-bio hub (use this in every social bio) |
| `/videos`, `/shorts` | Gallery with topic chips (Fishing / Kayaks / Homelab) and a Videos / Shorts switch (`?topic=fishing&kind=short`) |
| `/videos/<slug>` | One page per upload: lite YouTube embed, description, related videos, VideoObject structured data |
| `/about`, `/contact` | Placeholder copy (replace when ready) |
| `/privacy`, `/terms` | Hoshi's existing pages, **verbatim, same URLs**. Text lives in `src/legal/*.html` |

## Local development

Requires Node **22.23.4+** (Astro 7). `.node-version` pins Node 22 for GitHub Actions and Cloudflare.

```sh
npm ci
npm run dev        # http://localhost:4321
npm run build      # -> ./dist
npx wrangler dev   # serve ./dist exactly like Cloudflare will (clean URLs, _redirects, 404)
DQ_DEMO=1 npm run build   # design preview with sample cards (never use for production)
```

## Content

- **Videos** – `src/data/videos.json`, filled automatically by `scripts/youtube-pull.mjs` from the
  public channel feed `https://www.youtube.com/feeds/videos.xml?channel_id=UCPAbQ9ezojvxz4BNbjARQUQ`
  (no API key). The workflow `.github/workflows/youtube-pull.yml` runs every 6 hours and commits only
  when something changed; that commit triggers a Cloudflare rebuild. Older videos stay after they drop off the 15-item feed.
  - Shorts: `/shorts/` links, the channel's Shorts playlist feed (`UUSH…`), or a `youtube.com/shorts/<id>` probe.
  - Topics: keyword tagging in `scripts/topics.mjs`, first time a video is seen. To fix a tag, edit
    `topics` for that video in `videos.json`; the script never re-tags existing entries.
  - Run by hand: `npm run youtube:pull` (or `node scripts/youtube-pull.mjs --dry-run`).
- **Site info / socials / topics** – `src/data/site.json`.
- **Privacy / Terms** – `src/legal/privacy.html`, `src/legal/terms.html`. Keep the URLs `/privacy` and `/terms`;
  Meta / TikTok / Google app settings point at them. `public/_redirects` also maps `/privacy-policy`, `/terms-of-service`, `/tos`.
- **Images** – Chopper's thumbnails/photos go in `src/assets/` (week 3 photo gallery). OG fallback image: `public/og-default.jpg`.

## Deploying on Cloudflare (one-time, done by Dan in the dashboard)

**Workers & Pages → Create → Workers → Import a repository → GitHub → `distractedquest-site`**

| Setting | Value |
|---|---|
| Project (Worker) name | `distractedquest-site` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Root directory | `/` (leave blank) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` (gives each PR a preview URL) |
| Builds for non-production branches | On |
| Environment variables | none needed (Node version comes from `.node-version`) |

`wrangler.jsonc` tells Cloudflare to serve `./dist` as static assets, with `html_handling: auto-trailing-slash`
(so `/privacy` serves `privacy.html` and `/privacy.html` redirects to `/privacy`, same as today) and
`not_found_handling: 404-page`.

Then:
1. Open the `distractedquest-site.<account>.workers.dev` URL and check `/`, `/links`, `/videos`, `/privacy`, `/terms`.
2. **Settings → Domains & Routes → Add → Custom domain**: `distractedquest.com`, then `www.distractedquest.com`.
   The apex currently serves Hoshi's privacy/terms site (looks like a Cloudflare Pages project). Remove
   `distractedquest.com` from that Pages project's *Custom domains* first (or delete the DNS record Cloudflare
   says is in the way). Other subdomains (Postiz etc.) are not affected.
3. **Web Analytics** (after the custom domain is live): Cloudflare dashboard → **Web Analytics → Add a site** →
   pick `distractedquest.com` from the drop-down → Done. Because the domain is proxied by Cloudflare, the beacon
   is injected automatically (Workers have no one-click toggle like Pages). Only if you choose
   "Enable with JS Snippet installation" do you paste the snippet at the placeholder comment in `src/layouts/Base.astro`.
4. **Google Search Console**: add `distractedquest.com` (Domain property, DNS verification via Cloudflare) and
   submit `https://distractedquest.com/sitemap-index.xml`.

Rollback: Cloudflare → the Worker → Deployments → roll back, or revert the commit on GitHub.

## CI

- `.github/workflows/ci.yml` – `astro check` + build + legal-page check on every push to `main` and every PR.
- `.github/workflows/youtube-pull.yml` – scheduled YouTube merge (also runnable from the Actions tab).
