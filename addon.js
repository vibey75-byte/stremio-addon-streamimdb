const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');

const manifest = {
  id: 'org.community.vidsrc',
  version: '1.1.0',
  name: 'VidSrc Connector',
  description: 'Stream filmes e séries via vidsrc.me directamente no Stremio.',
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
      ? `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`
      : `https://vidsrc.me/embed/movie?imdb=${imdbId}`;

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
          name: 'VidSrc',
          title: 'Stream direto'
        }]
      };
    }

    return {
      streams: [{
        externalUrl: fallbackUrl,
        name: 'VidSrc',
        title: 'Abrir no browser'
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
