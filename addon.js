const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');

const manifest = {
  id: 'org.local.playimdb',
  version: '1.0.0',
  name: 'StreamIMDb Connector',
  description: 'Wrapper para streamimdb.me — abre streams no browser ou tenta extrair link direto.',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  try {
    // Para séries, o id vem como "tt1234567:1:2" — extrair só o IMDb ID
    const imdbId = args.id.split(':')[0];

    const fallbackUrl = `https://streamimdb.me/embed/${imdbId}/`;

    let result = null;
    try {
      result = await fetchVideoSource(imdbId);
    } catch (scraperErr) {
      console.error(`[scraper] Erro ao extrair fonte: ${scraperErr.message}`);
    }

    if (result && result.type === 'direct') {
      return {
        streams: [{
          url: result.url,
          name: 'StreamIMDb',
          title: 'Stream direto'
        }]
      };
    }

    // iframe ou fallback — abrir no browser
    const externalUrl = (result && result.url) ? result.url : fallbackUrl;
    return {
      streams: [{
        externalUrl,
        name: 'PlayIMDb',
        title: 'Abrir no browser'
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
