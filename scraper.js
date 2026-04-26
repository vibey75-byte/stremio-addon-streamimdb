const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

function buildEmbedUrl(imdbId, type, season, episode) {
  if (type === 'series') {
    return `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`;
  }
  return `https://vidsrc.me/embed/movie?imdb=${imdbId}`;
}

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

  const embedUrl = buildEmbedUrl(imdbId, type, season, episode);
  console.log('[scraper] Embed URL:', embedUrl);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: getBrowserPath(),
      args: LAUNCH_ARGS
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    let streamUrl = null;

    // Capturar via responses (não bloqueia pedidos como setRequestInterception)
    page.on('response', async res => {
      try {
        const url = res.url();
        if (!streamUrl && url.includes('.m3u8')) {
          console.log('[scraper] Stream capturado:', url.substring(0, 100));
          streamUrl = url;
        }
      } catch (_) {}
    });

    await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

    // Aguardar stream até 30 segundos
    const deadline = Date.now() + 30000;
    while (!streamUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    if (streamUrl) return { url: streamUrl, type: 'direct' };

    console.log('[scraper] Stream não capturado');
    return null;
  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchVideoSource };
