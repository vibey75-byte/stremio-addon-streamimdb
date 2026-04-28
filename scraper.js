const puppeteer = require('puppeteer');
const fs = require('fs');

// URLs configuráveis via env vars — sem redeploy quando o site muda
const MOVIE_PLAYER  = process.env.MOVIE_PLAYER_URL  || 'https://player.mov2day.xyz/movie';
const TV_EMBED      = process.env.TV_EMBED_URL       || 'https://cdn.mov2day.xyz/embed/tv';

const CACHE_TTL     = parseInt(process.env.CACHE_TTL_MS)  || 2 * 60 * 60 * 1000; // 2h
const MAX_QUEUE     = parseInt(process.env.MAX_QUEUE)      || 3; // máx pedidos únicos em fila

// Cache de resultados: evita rescraping do mesmo conteúdo
const cache = new Map();
// Deduplicação: se o mesmo conteúdo está a ser scraped, aguarda o resultado existente
const pending = new Map();

let activeScrapes = 0;

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

function getBrowserPath() {
  const paths = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser', '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return paths.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || undefined;
}

function parseBestQuality(content, masterUrl) {
  try {
    const lines = content.split('\n');
    let best = null;
    let bestBandwidth = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
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

// Browser persistente
let browser = null;

async function getBrowser() {
  if (browser) {
    try { await browser.pages(); return browser; } catch { browser = null; }
  }
  console.log('[browser] A lançar...');
  browser = await puppeteer.launch({
    headless: true,
    executablePath: getBrowserPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  console.log('[browser] Pronto');
  return browser;
}

getBrowser().catch(e => console.error('[browser] Erro no arranque:', e.message));

// Scraping de um único conteúdo (sem cache, sem deduplicação)
async function doScrape(imdbId, type, season, episode) {
  const playerUrl = type === 'series'
    ? `${TV_EMBED}/${imdbId}/${season}/${episode}`
    : `${MOVIE_PLAYER}/${imdbId}`;

  console.log(`[scraper] A tentar (${type}):`, playerUrl);
  let page1;

  try {
    const b = await getBrowser();
    page1 = await b.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let masterUrl = null;
    let masterContentResolve;
    const masterContentPromise = new Promise(r => { masterContentResolve = r; });

    page1.on('request', req => {
      const url = req.url();
      if (url.includes('.m3u8')) {
        if (!masterUrl || (!masterUrl.includes('master') && url.includes('master'))) masterUrl = url;
      }
      req.continue();
    });

    page1.on('response', async res => {
      try {
        if (res.url().includes('master.m3u8')) {
          const text = await res.text();
          masterContentResolve(text);
        }
      } catch { masterContentResolve(null); }
    });

    await page1.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    if (type === 'movie') {
      await page1.click('#play-btn').catch(() => {});
      console.log('[scraper] Play clicado...');
    }

    const deadline = Date.now() + 15000;
    while (!masterUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    const masterContent = await Promise.race([
      masterContentPromise,
      new Promise(r => setTimeout(() => r(null), 3000))
    ]);

    await page1.close();
    page1 = null;

    if (!masterUrl) { console.log('[scraper] Stream não capturado'); return null; }
    console.log('[scraper] Stream capturado:', masterUrl.substring(0, 80));

    return masterContent ? parseBestQuality(masterContent, masterUrl) : masterUrl;

  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    browser = null;
    return null;
  } finally {
    if (page1) await page1.close().catch(() => {});
    activeScrapes = Math.max(0, activeScrapes - 1);
  }
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) throw new Error(`ID IMDb inválido: ${imdbId}`);

  const key = cacheKey(imdbId, type, season, episode);

  // 1. Cache hit — resposta instantânea
  const cached = getCached(key);
  if (cached) {
    console.log(`[cache] Hit: ${key}`);
    return { url: cached, type: 'direct' };
  }

  // 2. Deduplicação — mesmo conteúdo já está a ser scraped
  if (pending.has(key)) {
    console.log(`[cache] Dedup: aguardando scrape em curso para ${key}`);
    const url = await pending.get(key);
    return url ? { url, type: 'direct' } : null;
  }

  // 3. Rejeição por sobrecarga — protege o servidor
  if (activeScrapes >= MAX_QUEUE) {
    console.log(`[scraper] Sobrecarga (${activeScrapes} scrapes activos) — a rejeitar pedido`);
    return null;
  }

  // 4. Iniciar novo scrape
  activeScrapes++;
  const scrapePromise = doScrape(imdbId, type, season, episode)
    .then(url => {
      if (url) setCached(key, url);
      pending.delete(key);
      return url;
    })
    .catch(err => {
      console.error('[scraper] Erro no scrape:', err.message);
      pending.delete(key);
      activeScrapes = Math.max(0, activeScrapes - 1);
      return null;
    });

  pending.set(key, scrapePromise);
  const url = await scrapePromise;
  return url ? { url, type: 'direct' } : null;
}

module.exports = { fetchVideoSource };
