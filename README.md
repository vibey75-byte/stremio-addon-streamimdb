# StreamIMDb Connector — Stremio Add-on

A Stremio add-on that fetches `.m3u8` video streams via a direct API call and plays them natively inside Stremio, without opening a browser.

## How it works

1. You click on a movie or series in Stremio
2. The add-on receives the IMDb ID (e.g. `tt0076759`)
3. It calls `streamdata.vaplayer.ru/api.php` directly (no browser, pure HTTP)
4. The API returns a list of `.m3u8` stream URLs
5. The best quality variant is selected from the HLS master playlist
6. The stream URL is returned to Stremio for native playback

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

## Notes

- Supports movies and series
- Results are cached for 2 hours — repeat requests are instant
- Falls back to an external URL if the stream cannot be fetched

## Environment variables (optional)

| Variable | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Project structure

```
server.js   — HTTP server (port 7000) + landing page
addon.js    — Stremio SDK manifest and stream handler
scraper.js  — API fetch logic with cache, dedup and queue protection
```
