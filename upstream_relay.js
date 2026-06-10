'use strict';
// Relay para outro deployment do addon (ex.: o servidor caseiro, IP residencial).
// Último recurso no Vercel: as CDNs que bloqueiam IPs de datacenter (VixSrc
// devolve 403 logo na API) funcionam a partir do servidor de casa, e os URLs
// que ele devolve já passam pelo proxy /hls dele (público via Cloudflare
// Tunnel) — entregam-se directos ao cliente, sem re-proxiar aqui.
//
// Activa-se definindo UPSTREAM_URL (ex.: https://stremio.thehouseofthemaster.pt)
// nos Project Settings do Vercel. Sem a var, é um no-op.
const axios = require('axios');

const UPSTREAM = (process.env.UPSTREAM_URL || '').replace(/\/$/, '');
// 1ª resolução no upstream pode demorar (Puppeteer ~10-20s); margem folgada
// mas dentro do limite da function do Vercel.
const TIMEOUT = parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 25000;

async function fetchFromUpstream(imdbId, type, season, episode) {
  if (!UPSTREAM) return null;
  const id = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;
  const url = `${UPSTREAM}/stream/${type}/${id}.json`; // id só tem tt/dígitos/':'
  try {
    const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: s => s < 500 });
    const streams = res.data && Array.isArray(res.data.streams) ? res.data.streams : [];
    // Só streams com url directo (ignora fallbacks externalUrl do upstream).
    const usable = streams.filter(s => s && s.url);
    if (!usable.length) { console.log('[upstream] sem streams utilizáveis'); return null; }
    console.log(`[upstream] ✓ ${usable.length} stream(s) via ${UPSTREAM}`);
    return usable.map(s => ({
      url: s.url,
      // O título do upstream já traz "SxEy · " — o nosso addon.js volta a
      // prefixá-lo, por isso retira-se aqui para não duplicar.
      quality: (s.title || 'Auto').replace(/^S\d+E\d+ · /, ''),
      proxyable: false, // URL absoluto do proxy do upstream — directo ao cliente
    }));
  } catch (e) {
    console.log('[upstream] erro:', e.message);
    return null;
  }
}

module.exports = { fetchFromUpstream };
