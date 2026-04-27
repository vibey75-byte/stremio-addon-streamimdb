const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

const EMBED_BASE = 'https://streamimdb.me/embed';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10000;

function getBrowserPath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return paths.find(p => fs.existsSync(p)) || undefined;
}

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
    console.log('[scraper] Fallback para master.m3u8:', e.message);
  }
  return masterUrl;
}

// Uma tentativa isolada de scraping com browser próprio
async function singleAttempt(embedUrl, attempt) {
  console.log(`[scraper] Tentativa ${attempt}/${MAX_ATTEMPTS}: ${embedUrl}`);
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: getBrowserPath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    // Passo 1: capturar URL do Cloudnestra
    const page1 = await browser.newPage();
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

    if (!cloudnestraUrl) {
      console.log('[scraper] Cloudnestra URL não encontrado');
      return null;
    }

    // Passo 2: clicar play e capturar .m3u8
    const page2 = await browser.newPage();
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
    console.log('[scraper] Play clicado, a aguardar stream...');

    const deadline = Date.now() + 15000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    await page2.close();
    return streamUrl || null;

  } catch (err) {
    console.error(`[scraper] Erro na tentativa ${attempt}:`, err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  const embedUrl = type === 'series'
    ? `${EMBED_BASE}/${imdbId}/${season}-${episode}/`
    : `${EMBED_BASE}/${imdbId}/`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`[scraper] A aguardar ${RETRY_DELAY_MS / 1000}s antes de retry...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    const streamUrl = await singleAttempt(embedUrl, attempt);

    if (streamUrl) {
      console.log('[scraper] Stream capturado:', streamUrl.substring(0, 80));
      const bestUrl = await getBestQuality(streamUrl);
      return { url: bestUrl, type: 'direct' };
    }

    console.log(`[scraper] Tentativa ${attempt} falhou`);
  }

  console.log('[scraper] Todas as tentativas falharam');
  return null;
}

module.exports = { fetchVideoSource };
