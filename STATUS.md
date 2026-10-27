# Status: distractedquest.com MVP (Option A, Cloudflare Workers static assets)

_Last updated: Mon Oct 26, 2026, ~10:15 PM CT. Built on the Locutus box; nothing pushed, no accounts touched._

## Done
- **Astro 7.4.2 static site** (Node 22.23.4+), local git repo on `main`, ready to push to a new GitHub repo.
  - `/links` hub, Home, `/videos` + `/shorts` gallery (topic chips Fishing/Kayaks/Homelab + Videos/Shorts switch,
    shareable `?topic=` URLs), per-video pages `/videos/<slug>` (lite embed + VideoObject), About (final copy) and placeholder Contact, 404.
  - Mobile-first outdoorsy design (lake green / sunrise orange), dark/light following the phone setting plus a toggle.
    Almost no JavaScript, no web fonts, 220 KB total build.
- **Privacy & Terms copied verbatim to the same paths** (text and links checked against the live pages, identical).
- **YouTube auto-pull**: `scripts/youtube-pull.mjs` (no dependencies, no API key) merges feed items into
  `src/data/videos.json`, detects Shorts, keyword-tags topics, and writes only on change. `.github/workflows/youtube-pull.yml`
  runs every 6 h and commits only when changed. Tested end-to-end against a public channel that has uploads (15 items, Shorts detected).
- **CI**: `.github/workflows/ci.yml` (astro check + build + legal-page check on push/PR).
- **SEO**: sitemap (`/sitemap-index.xml`), `robots.txt`, canonical URLs, Open Graph + X cards with a branded
  1200×630 `og-default.jpg`, Organization/WebSite/VideoObject JSON-LD. Cloudflare Web Analytics placeholder comment is in `src/layouts/Base.astro`.
- **Cloudflare config**: `wrangler.jsonc` (name `distractedquest-site`, assets `./dist`, `auto-trailing-slash`, `404-page`),
  `public/_redirects`, `public/_headers`. README has the exact import settings.
- **Verified**: `npm run build` and `astro check` pass with 0 errors and 0 warnings. Served `dist` with `wrangler dev`
  (the same static-asset engine Cloudflare uses):
  `/`, `/links`, `/videos`, `/shorts`, `/about`, `/contact`, `/privacy`, `/terms` → 200; `/privacy.html`, `/terms.html`, `/privacy/` → 307 to the clean URL
  (same behavior as today's site); `/privacy-policy`, `/terms-of-service` → 301; unknown → 404.
- Screenshots: `/workspace/distractedquest-site-screens/`. Files without a prefix show the real build, which has
  no videos yet. Files starting `demo-` show the layout filled with sample cards (`DQ_DEMO=1` build, not for production).

## Key facts
- **Privacy/Terms paths (live today):** `https://distractedquest.com/privacy` and `https://distractedquest.com/terms`
  (`/privacy.html` and `/terms.html` 307-redirect to them). `/privacy-policy`, `/terms-of-service` and `/sitemap.xml` are 404 today.
  The current site looks like a Cloudflare **Pages** project (Hoshi's 4 files: index, privacy, terms, style.css).
- **YouTube channel ID:** `UCPAbQ9ezojvxz4BNbjARQUQ` (canonical URL of youtube.com/@distractedquest).
  Feed: https://www.youtube.com/feeds/videos.xml?channel_id=UCPAbQ9ezojvxz4BNbjARQUQ

## Unresolved / open questions
1. **No public videos yet.** The channel page says it has no content, and its feed returns 404 (YouTube does this for empty channels).
   `videos.json` is therefore `[]`, and the site shows a "First videos are on the way" panel. The first two uploads are scheduled
   (Postiz) for Wed Oct 28. The next 6-hourly run after they go public will add them automatically. (YouTube's feed is also a bit flaky,
   so the script retries and treats 404/5xx as "no change".)
2. **Social URLs to confirm** (assumed from the "@distractedquest everywhere" line on Hoshi's home page): instagram.com/distractedquest,
   tiktok.com/@distractedquest, x.com/distractedquest, facebook.com/profile.php?id=61595684019632 (Dan's Facebook Page, confirmed by Dan Oct 27; Hoshi to verify).
   They're edited in `src/data/site.json`.
3. **About text: DONE** (drafted by Hoshi, approved by Dan Oct 27). Still placeholder: About photo, the Contact media-kit numbers, home photo strip, hero art (an illustrated sunrise
   until Chopper supplies a hero photo or clip), logo (placeholder badge until the channel logo is added).
4. **GitHub repo: create it PUBLIC** (Dan decided Oct 27).
5. "Cigars / side quests" content currently tags as Fishing/Kayaks only. A 4th topic could be added later if wanted.

## Week 2+ notes
Topic hubs (/fishing, /kayaks, /homelab), gear/location/transcript notes per video, Photos gallery (Chopper), Instagram/TikTok
embeds, Blog, Gear page, real media-kit stats.

## Dan's remaining steps (in order)
a. **Connect GitHub to Locutus** (one-time sign-in, done by Dan).
b. **Locutus creates the repo** `distractedquest-site`, pushes, and opens the MVP PR (an assistant step, done after the connect).
   Everything is currently one commit on local `main`. To give Dan a PR to review, push a bare initial commit as `main`
   and this work as an `mvp` branch, then open `mvp` → `main`.
c. **Review and merge the MVP PR** (CI must be green).
d. **Cloudflare dashboard → Workers & Pages → Create → Workers → Import a repository → GitHub → `distractedquest-site`.**
   Worker name `distractedquest-site` · production branch `main` · root `/` · build command `npm run build` ·
   deploy command `npx wrangler deploy` · non-production deploy command `npx wrangler versions upload` (PR previews) · no env vars.
e. **Check the `*.workers.dev` preview**: `/`, `/links`, `/videos`, and especially `/privacy` and `/terms`.
f. **Attach custom domains** `distractedquest.com` and `www.distractedquest.com` (Worker → Settings → Domains & Routes → Add → Custom domain).
   This **replaces what serves Hoshi's current page**: first remove `distractedquest.com` from the existing Pages project's
   Custom domains, or let Cloudflare delete the conflicting DNS record. The Postiz subdomain and other subdomains are untouched.
   Afterwards Locutus re-checks that the live `/privacy` and `/terms` return 200 and match the Meta/TikTok app settings.
g. **Web Analytics**: Cloudflare → Web Analytics → Add a site → `distractedquest.com` (automatic injection, since the domain is proxied).
h. **Google Search Console**: add the `distractedquest.com` domain property (DNS verify via Cloudflare) and submit
   `https://distractedquest.com/sitemap-index.xml`.
Then: Hoshi switches social bios to `distractedquest.com/links`.
