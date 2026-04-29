# StreamIMDb Connector — Stremio Add-on

A Stremio add-on that fetches `.m3u8` video streams via a direct API call and plays them natively inside Stremio, without opening a browser.

## Features

- **Multiple quality streams** — exposes all available variants (4K, 2K, 1080p, 720p, 480p) as separate selectable streams
- **Auto CDN fallback** — tests all available CDN sources in parallel, picks the first working one
- **Binge watching** — next episode screen appears at the end of each episode
- **Health monitoring** — automatic periodic checks of the upstream API with webhook/email alerts
- **Fast & lightweight** — pure HTTP, no browser, <5s response time, ~5MB RAM per request

## How it works

1. You click on a movie or series in Stremio
2. The add-on receives the IMDb ID (e.g. `tt0076759`)
3. It calls `streamdata.vaplayer.ru/api.php` directly (no browser, pure HTTP)
4. The API returns a list of `.m3u8` stream URLs tested in parallel
5. The HLS master playlist is parsed to extract all quality variants
6. All quality options are returned to Stremio for native playback

## Requirements

- [Node.js](https://nodejs.org) v18+
- Windows, macOS or Linux

## Installation

```bash
git clone https://github.com/F100Pilot/stremio-addon-streamimdb.git
cd stremio-addon-streamimdb
npm install
```

## Usage

```bash
node server.js
```

The server starts at `http://localhost:7000`.

To install in Stremio, open Stremio and add the add-on using this URL:
```
http://localhost:7000/manifest.json
```

Or visit `http://localhost:7000` for the install page.

## Performance

| | v1.0 (Puppeteer) | v1.1 (API direct) |
|---|---|---|
| Response time | ~25s | <5s |
| RAM per request | ~150 MB | ~5 MB |
| Simultaneous users | 1–2 | Unlimited |
| Quality selection | Best only | All variants |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` | Upstream stream API |
| `CACHE_TTL_MS` | `900000` (15min) | Stream URL cache duration |
| `MAX_QUEUE` | `3` | Max concurrent scrape requests |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` (5min) | Health check frequency |
| `ALERT_WEBHOOK` | — | Slack/Discord webhook URL for alerts |
| `ALERT_EMAIL` | — | Email address for alerts |

## Project structure

```
server.js   — HTTP server (port 7000) + landing page + /health endpoint
addon.js    — Stremio SDK manifest and stream handler
scraper.js  — API fetch, quality parsing, cache, dedup and queue protection
health.js   — Periodic API health checks and alert system
```
