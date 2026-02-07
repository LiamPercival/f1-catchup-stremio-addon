# F1 Calendar & Catalog - Stremio Addon

A Stremio addon that provides a comprehensive Formula 1 calendar and catalog, fully mapped to TheTVDB metadata.

## Features

- **Accurate Session Lists**: Includes all Practice, Qualifying, Sprint, and Race sessions.
- **TVDB Integration**: Maps sessions to TheTVDB Series ID 387219, allowing other addons (like Torrentio) to find streams accurately.
- **Season Support**: Covers 2023, 2024, and 2025 seasons.
- **Automated Updates**: Fetches latest schedule from OpenF1/Ergast APIs.

## How It Works

1. Install the addon in Stremio.
2. Browse the "Formula 1" catalog.
3. Select a season (year) and episode (session).
4. Stremio will search installed stream providers (e.g., Torrentio) using the precise TVDB ID (e.g., `S2024E09`).

## Development

This addon is built for Cloudflare Pages.

```bash
npm install
npm run dev
```

## Deployment

Push to the `main` branch to deploy to Cloudflare Pages.
