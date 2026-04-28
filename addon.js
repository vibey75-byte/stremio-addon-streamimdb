const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');

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

builder.defineStreamHandler(async (args) => {
  try {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    const type = parts.length > 1 ? 'series' : 'movie';
    const season = parts[1] || null;
    const episode = parts[2] || null;

    const fallbackUrl = type === 'series'
      ? `https://streamimdb.me/embed/${imdbId}/${season}/${episode}/`
      : `https://streamimdb.me/embed/${imdbId}/`;

    let result = null;
    try {
      result = await fetchVideoSource(imdbId, type, season, episode);
    } catch (scraperErr) {
      console.error(`[handler] Erro no scraper: ${scraperErr.message}`);
    }

    if (result && result.type === 'direct') {
      return {
        streams: [{
          url: result.url,
          name: 'StreamIMDb',
          title: type === 'series' ? `S${season}E${episode}` : 'Stream direto',
        }]
      };
    }

    return {
      streams: [{
        externalUrl: fallbackUrl,
        name: 'StreamIMDb',
        title: 'No stream available'
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
