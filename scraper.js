const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

const EMBED_BASE = 'https://streamimdb.me/embed';

function getBrowserPath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return paths.find(p => fs.existsSync(p)) || undefined;
}

// Browser persistente — lançado uma vez, reutilizado em todos os pedidos
let browser = null;
let scraping = false;

async function getBrowser() {
  if (browser) {
    try {
      await browser.pages(); // verifica se ainda está vivo
      return browser;
    } catch {
      browser = null;
    }
  }
  console.log('[browser] A lançar browser...');
  browser = await puppeteer.launch({
    headless: true,
    executablePath: getBrowserPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  console.log('[browser] Pronto');
  return browser;
}

// Inicializar browser ao arrancar o servidor
getBrowser().catch(err => console.error('[browser] Erro no arranque:', err.message));

async function getBestQuality(masterUrl) {
  try {
    const res = await axios.get(masterUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cloudnestra.com/' }
    });
    const lines = res.data.split('\n');
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
  } catch (e) {
    console.log('[scraper] Fallback master.m3u8:', e.message);
  }
  return masterUrl;
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  // Evitar scrapes simultâneos
  if (scraping) {
    console.log('[scraper] Scrape em progresso, a aguardar...');
    const waitUntil = Date.now() + 60000;
    while (scraping && Date.now() < waitUntil) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  scraping = true;
  const embedUrl = type === 'series'
    ? `${EMBED_BASE}/${imdbId}/${season}-${episode}/`
    : `${EMBED_BASE}/${imdbId}/`;

  console.log('[scraper] A tentar:', embedUrl);
  let page1, page2;

  try {
    const b = await getBrowser();

    // Passo 1: capturar URL do Cloudnestra
    page1 = await b.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let cloudnestraUrl = null;
    page1.on('request', req => {
      const url = req.url();
      if (!cloudnestraUrl && url.includes('cloudnestra.com/rcp/')) cloudnestraUrl = url;
      req.continue();
    });

    await page1.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    await page1.close();
    page1 = null;

    if (!cloudnestraUrl) { console.log('[scraper] Cloudnestra não encontrado'); return null; }
    console.log('[scraper] Cloudnestra encontrado');

    // Passo 2: clicar play e capturar .m3u8
    page2 = await b.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page2.setExtraHTTPHeaders({ 'Referer': 'https://streamimdb.me/' });
    await page2.setRequestInterception(true);

    let streamUrl = null;
    page2.on('request', req => {
      const url = req.url();
      if (url.includes('.m3u8')) {
        if (!streamUrl) streamUrl = url;
        else if (!streamUrl.includes('master') && url.includes('master')) streamUrl = url;
      }
      req.continue();
    });

    await page2.goto(cloudnestraUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page2.click('#pl_but').catch(() => {});
    console.log('[scraper] Play clicado...');

    const deadline = Date.now() + 15000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    await page2.close();
    page2 = null;

    if (!streamUrl) { console.log('[scraper] Stream não capturado'); return null; }

    console.log('[scraper] Stream capturado:', streamUrl.substring(0, 80));
    const bestUrl = await getBestQuality(streamUrl);
    return { url: bestUrl, type: 'direct' };

  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    // Se o browser crashou, forçar recriação
    browser = null;
    return null;
  } finally {
    if (page1) await page1.close().catch(() => {});
    if (page2) await page2.close().catch(() => {});
    scraping = false;
  }
}

module.exports = { fetchVideoSource };
