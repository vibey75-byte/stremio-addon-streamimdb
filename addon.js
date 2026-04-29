'use strict';
const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');

const BRIGHTPATH_BASE = 'https://brightpathsignals.com/embed';
const PORT = process.env.PORT || 7000;
const SERVER_BASE = (
  process.env.RENDER_EXTERNAL_URL ||
  process.env.SERVER_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, '');

const manifest = {
  id: 'org.local.streamimdb',
  version: '1.1.1',
  name: 'StreamIMDb Connector',
  description: 'Stream movies and series via streamimdb.me natively inside Stremio.',
  logo: 'https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

function makeHlsProxyUrl(streamUrl, referer) {
  const encoded = Buffer.from(JSON.stringify({ u: streamUrl, r: referer })).toString('base64url');
  return `${SERVER_BASE}/hls/${encoded}`;
}

builder.defineStreamHandler(async (args) => {
  try {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    const type = parts.length > 1 ? 'series' : 'movie';
    const season = parts[1] || null;
    const episode = parts[2] || null;

    const referer = type === 'series'
      ? `${BRIGHTPATH_BASE}/tv/${imdbId}/${season}/${episode}`
      : `${BRIGHTPATH_BASE}/movie/${imdbId}`;

    const fallbackUrl = type === 'series'
      ? `https://streamimdb.me/embed/${imdbId}/${season}/${episode}/`
      : `https://streamimdb.me/embed/${imdbId}/`;

    let result = null;
    try {
      result = await fetchVideoSource(imdbId, type, season, episode);
    } catch (scraperErr) {
      console.error(`[handler] Erro no scraper: ${scraperErr.message}`);
    }

    // Retry once on transient null (overload slot freed or brief API hiccup)
    if (!result) {
      await new Promise(r => setTimeout(r, 600));
      try {
        result = await fetchVideoSource(imdbId, type, season, episode);
      } catch (_) {}
    }

    if (result && result.type === 'direct') {
      const best = result.streams[0];
      return {
        streams: [{
          url: makeHlsProxyUrl(best.url, referer),
          name:  'StreamIMDb',
          title: type === 'series' ? `S${season}E${episode} · ${best.quality}` : best.quality,
          behaviorHints: type === 'series' ? { bingeGroup: `streamimdb-${imdbId}` } : undefined,
        }]
      };
    }

    return {
      streams: [{
        externalUrl: fallbackUrl,
        name:  'StreamIMDb',
        title: 'No stream available',
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
