# StreamIMDb Connector — Stremio Add-on

A local Stremio add-on that extracts video streams directly from [streamimdb.me](https://streamimdb.me) and plays them natively inside Stremio, without opening a browser.

## How it works

1. You click on a movie or series in Stremio
2. The add-on receives the IMDb ID (e.g. `tt0076759`)
3. A headless browser (Puppeteer) navigates to `streamimdb.me` in the background
4. It captures the real `.m3u8` stream URL
5. Returns it to Stremio for native playback

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

## Notes

- The first stream request takes ~20-30 seconds (the headless browser needs to load the pages)
- Supports both movies and series
- Automatically falls back to opening in the browser if the stream cannot be captured

## Project structure

```
server.js   — HTTP server on port 7000
addon.js    — Stremio SDK manifest and stream handler
scraper.js  — Puppeteer logic to capture the stream URL
```
