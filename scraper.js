const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

const EMBED_BASE = 'https://streamimdb.me/embed';

function getBrowserPath() {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return paths.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || undefined;
}

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--disable-blink-features=AutomationControlled'
];

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  const embedUrl = type === 'series'
    ? `${EMBED_BASE}/${imdbId}/${season}/${episode}/`
    : `${EMBED_BASE}/${imdbId}/`;

  console.log('[scraper] Embed URL:', embedUrl);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: getBrowserPath(),
      args: LAUNCH_ARGS
    });

    // Passo 1: carregar embed e capturar URL do Cloudnestra
    const page1 = await browser.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let cloudnestraUrl = null;
    page1.on('request', req => {
      const url = req.url();
      if (!cloudnestraUrl && url.includes('cloudnestra.com/rcp/')) cloudnestraUrl = url;
      req.continue();
    });

    await page1.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    await page1.close();

    if (!cloudnestraUrl) {
      console.log('[scraper] Cloudnestra URL não encontrado');
      return null;
    }

    console.log('[scraper] Cloudnestra URL encontrado');

    // Passo 2: navegar para Cloudnestra, clicar play, capturar .m3u8
    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page2.setExtraHTTPHeaders({ 'Referer': 'https://streamimdb.me/' });
    await page2.setRequestInterception(true);

    let streamUrl = null;
    page2.on('request', req => {
      const url = req.url();
      if (!streamUrl && url.includes('.m3u8')) {
        console.log('[scraper] Stream capturado:', url.substring(0, 80));
        streamUrl = url;
      }
      req.continue();
    });

    await page2.goto(cloudnestraUrl, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page2.click('#pl_but').catch(() => {});
    console.log('[scraper] Play clicado, a aguardar stream...');

    const deadline = Date.now() + 25000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    await page2.close();

    if (streamUrl) return { url: streamUrl, type: 'direct' };

    console.log('[scraper] Stream não capturado após clique');
    return null;
  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchVideoSource };
