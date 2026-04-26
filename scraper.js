const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://vidsrc.me/'
};

function buildEmbedUrl(imdbId, type, season, episode) {
  if (type === 'series') {
    return `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`;
  }
  return `https://vidsrc.me/embed/movie?imdb=${imdbId}`;
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  const embedUrl = buildEmbedUrl(imdbId, type, season, episode);
  console.log('[scraper] A tentar:', embedUrl);

  try {
    // Passo 1: carregar a página embed
    const res1 = await axios.get(embedUrl, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(res1.data);

    // Procurar iframe de source dentro da página
    let sourceUrl = null;

    // Padrão vidsrc.me: iframe com src que aponta para o player real
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && (src.includes('vidsrc') || src.includes('vidplay') || src.includes('rcp'))) {
        sourceUrl = src.startsWith('//') ? 'https:' + src : src;
        return false;
      }
    });

    // Fallback: procurar links de vídeo direto na página
    if (!sourceUrl) {
      $('source, video').each((_, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
          sourceUrl = src;
          return false;
        }
      });
    }

    if (!sourceUrl) {
      console.log('[scraper] Nenhuma fonte encontrada na página embed');
      return null;
    }

    console.log('[scraper] Fonte intermédia:', sourceUrl.substring(0, 80));

    // Passo 2: seguir a fonte intermédia para tentar obter m3u8
    const res2 = await axios.get(sourceUrl, {
      headers: { ...HEADERS, Referer: embedUrl },
      timeout: 10000
    });

    // Procurar m3u8 ou mp4 no HTML resultante
    const html2 = res2.data;
    const m3u8Match = html2.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/);
    const mp4Match = html2.match(/https?:[^"'\s]+\.mp4[^"'\s]*/);

    const streamUrl = m3u8Match?.[0] || mp4Match?.[0];

    if (streamUrl) {
      console.log('[scraper] Stream capturado:', streamUrl.substring(0, 80));
      return { url: streamUrl, type: 'direct' };
    }

    // Se não encontrou stream mas encontrou a fonte, devolve como externalUrl
    console.log('[scraper] Stream não encontrado, a usar fonte intermédia');
    return { url: sourceUrl, type: 'iframe' };

  } catch (err) {
    console.error('[scraper] Erro HTTP:', err.message);
    return null;
  }
}

module.exports = { fetchVideoSource };
