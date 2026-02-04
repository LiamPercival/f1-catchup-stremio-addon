# F1 Catchup - Stremio Addon

Formula 1 addon for Stremio with Torbox integration. Deployed on Cloudflare Pages.

## Features

- All F1 seasons from 2000 onwards (auto-updating from F1 API)
- Every session: FP1, FP2, FP3, Qualifying, Grand Prix
- Sprint weekend support: Sprint Qualifying and Sprint races detected automatically
- Country flags as thumbnails (spoiler-free)
- Torbox integration for finding streams
- Latest sessions shown first

## How It Works

1. Visit the config page and enter your Torbox API key
2. Click Install — the addon registers in Stremio with your key in the URL
3. Browse F1 seasons in Stremio's catalog
4. Select a season to see all race sessions as episodes
5. Click an episode — the addon searches Torbox for matching streams

The API key is stored in the manifest URL on your Stremio client, not on the server.

## File Structure

```
f1-catchup-stremio-addon/
├── public/
│   ├── index.html          # Config page (enter API key, install)
│   ├── _routes.json         # Cloudflare routing config
│   └── images/              # Self-hosted addon images
│       ├── logo.png
│       ├── poster.png
│       └── background.jpg
├── functions/
│   └── [[path]].js          # Addon API (Cloudflare Pages Function)
├── package.json
└── README.md
```

## External APIs

| API | Purpose | Auth |
|-----|---------|------|
| [api.jolpi.ca/ergast/f1](https://api.jolpi.ca/ergast/f1) | F1 seasons and race calendars | None (free) |
| [api.torbox.app](https://torbox.app) | Torrent stream search | User's API key |
| [flagcdn.com](https://flagcdn.com) | Country flag images | None (free) |

## Deployment

This repo is connected to Cloudflare Pages. Pushing to `main` triggers an automatic deployment.

**Cloudflare Pages settings:**

| Setting | Value |
|---------|-------|
| Build command | *(empty)* |
| Build output directory | `public` |

## Local Development

```bash
npx wrangler pages dev public --compatibility-date=2024-01-01
```

Then visit `http://localhost:8788`. Note: API key validation and Stremio install won't work locally — deploy to Cloudflare for full testing.

## Troubleshooting

**Stremio doesn't open when clicking Install:**
Open Stremio manually, go to Addons, paste `https://YOUR-DOMAIN/YOUR_API_KEY/manifest.json` into the search bar.

**No streams found:**
Check your Torbox API key is valid. Older or less popular sessions may not have torrents available.

**Episodes not loading:**
Check Cloudflare Pages function logs in the dashboard for API errors.
