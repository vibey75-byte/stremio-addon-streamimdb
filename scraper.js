const puppeteer = require('puppeteer');
const fs = require('fs');

const EMBED_BASE = 'https://streamimdb.me/embed';

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

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--single-process'
];

async function fetchVideoSource(imdbId) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  let browser;

  try {
    const executablePath = getBrowserPath();
    console.log('[scraper] Browser path:', executablePath || 'puppeteer bundled');

    // Log do path real que o puppeteer vai usar
    try {
      const { executablePath: bundledPath } = require('puppeteer');
      console.log('[scraper] Puppeteer bundled path:', bundledPath);
    } catch (e) {}

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    // --- Passo 1: carregar embed e capturar URL do Cloudnestra ---
    const page1 = await browser.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let cloudnestraUrl = null;
    page1.on('request', req => {
      const url = req.url();
      if (!cloudnestraUrl && url.includes('cloudnestra.com/rcp/')) {
        cloudnestraUrl = url;
      }
      req.continue();
    });

    await page1.goto(`${EMBED_BASE}/${imdbId}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    await page1.close();

    if (!cloudnestraUrl) {
      console.log('[scraper] Cloudnestra URL não encontrado');
      return null;
    }

    console.log('[scraper] Cloudnestra URL encontrado');

    // --- Passo 2: navegar para Cloudnestra, clicar play, capturar .m3u8 ---
    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page2.setExtraHTTPHeaders({ 'Referer': 'https://streamimdb.me/' });
    await page2.setRequestInterception(true);

    let streamUrl = null;
    page2.on('request', req => {
      const url = req.url();
      if (!streamUrl && url.includes('.m3u8')) {
        streamUrl = url;
      }
      req.continue();
    });

    await page2.goto(cloudnestraUrl, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    await page2.click('#pl_but').catch(() => {});
    console.log('[scraper] Play clicado, a aguardar stream...');

    const deadline = Date.now() + 15000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    await page2.close();

    if (streamUrl) {
      console.log('[scraper] Stream capturado:', streamUrl.substring(0, 80));
      return { url: streamUrl, type: 'direct' };
    }

    console.log('[scraper] Stream não capturado após clique');
    return null;
  } catch (err) {
    console.error('[scraper] Erro ao lançar browser:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchVideoSource };
