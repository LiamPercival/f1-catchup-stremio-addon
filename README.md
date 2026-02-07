# F1 Catchup - Stremio Addon

A Stremio addon that provides Formula 1 metadata sourced directly from TheTVDB, enabling stream addons like Torrentio to find the correct content for every session.

## Setup

1. Get a free API key from [TheTVDB](https://thetvdb.com/api-information).
2. Install the addon in Stremio — you'll be prompted to enter your TVDB API key.
3. Browse the "Formula 1" catalog, pick a season and session, and Stremio resolves streams via your installed providers.

## How It Works

The addon fetches episode data from TVDB Series 387219 (Formula 1) and maps it to Stremio's metadata format. Every practice, qualifying, sprint, and race session has a TVDB episode entry, so stream providers like Torrentio can match content accurately using IDs like `S2024E09`.

## Development

Built for Cloudflare Pages.

```bash
npm install
npm run dev
```

## Deployment

```bash
npm run deploy
```