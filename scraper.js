const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

function getBrowserPath() {
  const paths = [
    // Linux (Render)
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Windows (local)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return paths.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || undefined;
}

function buildPlayerUrl(imdbId, type, season, episode) {
  if (type === 'series') {
    return `https://player.mov2day.xyz/tv/${imdbId}/${season}/${episode}`;
  }
  return `https://player.mov2day.xyz/movie/${imdbId}`;
}

async function getBestQuality(masterUrl) {
  try {
    const res = await axios.get(masterUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://player.mov2day.xyz/' }
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

// Browser persistente — sem overhead de arranque em cada pedido
let browser = null;
let scraping = false;

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

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) throw new Error(`ID IMDb inválido: ${imdbId}`);

  if (scraping) {
    console.log('[scraper] A aguardar scrape em curso...');
    const limit = Date.now() + 60000;
    while (scraping && Date.now() < limit) await new Promise(r => setTimeout(r, 1000));
  }

  scraping = true;
  const playerUrl = buildPlayerUrl(imdbId, type, season, episode);
  console.log('[scraper] A tentar:', playerUrl);

  let page1, page2;
  try {
    const b = await getBrowser();

    // Carregar o player e clicar play
    page1 = await b.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let streamUrl = null;
    page1.on('request', req => {
      const url = req.url();
      if (url.includes('.m3u8')) {
        if (!streamUrl) streamUrl = url;
        else if (!streamUrl.includes('master') && url.includes('master')) streamUrl = url;
      }
      req.continue();
    });

    await page1.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page1.click('#play-btn').catch(() => {});
    console.log('[scraper] Play clicado...');

    const deadline = Date.now() + 15000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    await page1.close();
    page1 = null;

    if (!streamUrl) { console.log('[scraper] Stream não capturado'); return null; }

    console.log('[scraper] Stream capturado:', streamUrl.substring(0, 80));
    const bestUrl = await getBestQuality(streamUrl);
    return { url: bestUrl, type: 'direct' };

  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    browser = null;
    return null;
  } finally {
    if (page1) await page1.close().catch(() => {});
    if (page2) await page2.close().catch(() => {});
    scraping = false;
  }
}

module.exports = { fetchVideoSource };
