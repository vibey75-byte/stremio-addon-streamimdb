'use strict';
const axios = require('axios');

const VAPLAYER_API_URL = process.env.VAPLAYER_API_URL || 'https://streamdata.vaplayer.ru/api.php';
const BRIGHTPATH_BASE  = 'https://brightpathsignals.com/embed';

const CACHE_TTL = parseInt(process.env.CACHE_TTL_MS) || 2 * 60 * 60 * 1000; // 2h
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE)    || 3;

const cache   = new Map();
const pending = new Map();
let activeScrapes = 0;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cacheKey(imdbId, type, season, episode) {
  return `${imdbId}:${type}:${season || ''}:${episode || ''}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.url;
}

function setCached(key, url) {
  cache.set(key, { url, timestamp: Date.now() });
  console.log(`[cache] Guardado: ${key} (cache size: ${cache.size})`);
}

function parseBestQuality(content, masterUrl) {
  try {
    const lines = content.split('\n');
    let best = null;
    let bestBandwidth = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const bw  = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
        const src = lines[i + 1]?.trim();
        if (src && bw >= bestBandwidth) {
          bestBandwidth = bw;
          best = src.startsWith('http') ? src : new URL(src, masterUrl).href;
        }
      }
    }
    if (best) { console.log(`[scraper] Qualidade: ${Math.round(bestBandwidth / 1000)}kbps`); return best; }
  } catch (e) { console.log('[scraper] Erro ao parsear qualidade:', e.message); }
  return masterUrl;
}

// Busca master playlist e selecciona melhor qualidade
async function fetchMaster(m3u8Url, referer) {
  try {
    const res = await axios.get(m3u8Url, {
      headers: { 'User-Agent': UA, Referer: referer },
      timeout: 8000,
      maxRedirects: 5,
      responseType: 'text',
    });
    const body = typeof res.data === 'string' ? res.data : '';
    if (body.trimStart().startsWith('#EXTM3U')) return parseBestQuality(body, m3u8Url);
  } catch (e) {
    console.log('[scraper] Erro ao buscar master:', e.message);
  }
  return m3u8Url;
}

async function doFetch(imdbId, type, season, episode) {
  // O Referer deve imitar a página embed do brightpathsignals para a API autorizar o pedido
  const referer = type === 'series'
    ? `${BRIGHTPATH_BASE}/tv/${imdbId}/${season}/${episode}`
    : `${BRIGHTPATH_BASE}/movie/${imdbId}`;

  const params = { imdb: imdbId, type: type === 'series' ? 'tv' : 'movie' };
  if (type === 'series') { params.season = season; params.episode = episode; }

  let apiRes;
  try {
    apiRes = await axios.get(VAPLAYER_API_URL, {
      params,
      headers: {
        'User-Agent': UA,
        'Referer': referer,
        'Origin': 'https://brightpathsignals.com',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (e) {
    console.error('[scraper] Erro na chamada API:', e.message);
    return null;
  }

  const body = apiRes.data;
  const preview = JSON.stringify(body).substring(0, 200);
  console.log(`[scraper] API ${apiRes.status} — ${preview}`);

  if (apiRes.status !== 200 || !body || !body.data) {
    console.log('[scraper] Resposta inválida ou erro da API');
    return null;
  }

  const streamUrls = body.data.stream_urls;
  if (!Array.isArray(streamUrls) || !streamUrls.length) {
    console.log('[scraper] Nenhum stream_url na resposta');
    return null;
  }

  const masterUrl = streamUrls[0];
  console.log('[scraper] stream_url obtido:', masterUrl.substring(0, 80));
  return fetchMaster(masterUrl, referer);
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) throw new Error(`ID IMDb inválido: ${imdbId}`);

  const key = cacheKey(imdbId, type, season, episode);

  // 1. Cache hit
  const cached = getCached(key);
  if (cached) { console.log(`[cache] Hit: ${key}`); return { url: cached, type: 'direct' }; }

  // 2. Deduplicação
  if (pending.has(key)) {
    console.log(`[cache] Dedup: aguardando fetch em curso para ${key}`);
    const url = await pending.get(key);
    return url ? { url, type: 'direct' } : null;
  }

  // 3. Rejeição por sobrecarga
  if (activeScrapes >= MAX_QUEUE) {
    console.log(`[scraper] Sobrecarga (${activeScrapes} pedidos activos) — a rejeitar`);
    return null;
  }

  // 4. Novo fetch
  activeScrapes++;
  const fetchPromise = doFetch(imdbId, type, season, episode)
    .then(url => {
      if (url) setCached(key, url);
      pending.delete(key);
      activeScrapes = Math.max(0, activeScrapes - 1);
      return url;
    })
    .catch(err => {
      console.error('[scraper] Erro:', err.message);
      pending.delete(key);
      activeScrapes = Math.max(0, activeScrapes - 1);
      return null;
    });

  pending.set(key, fetchPromise);
  const url = await fetchPromise;
  return url ? { url, type: 'direct' } : null;
}

module.exports = { fetchVideoSource };
