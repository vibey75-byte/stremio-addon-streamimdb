const puppeteer = require('puppeteer');
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

function buildEmbedUrl(imdbId, type, season, episode) {
  if (type === 'series') {
    return `https://cdn.mov2day.xyz/embed/tv/${imdbId}/${season}/${episode}`;
  }
  return `https://cdn.mov2day.xyz/embed/movie/${imdbId}`;
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
  } catch (e) {
    console.log('[scraper] Erro ao parsear qualidade:', e.message);
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
  const playerUrl = buildEmbedUrl(imdbId, type, season, episode);
  console.log('[scraper] A tentar:', playerUrl);

  let page1, page2;
  try {
    const b = await getBrowser();

    // Carregar o player e clicar play
    page1 = await b.newPage();
    await page1.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page1.setRequestInterception(true);

    let masterUrl = null;
    const allM3u8 = []; // todos os .m3u8 capturados
    let masterContentResolve;
    const masterContentPromise = new Promise(r => { masterContentResolve = r; });

    page1.on('request', req => {
      const url = req.url();
      if (url.includes('.m3u8')) {
        allM3u8.push(url);
        if (!masterUrl || (!masterUrl.includes('master') && url.includes('master'))) masterUrl = url;
      }
      req.continue();
    });

    // Interceptar resposta do master.m3u8 com Promise para garantir leitura completa
    page1.on('response', async res => {
      try {
        if (res.url().includes('master.m3u8')) {
          const text = await res.text();
          masterContentResolve(text);
        }
      } catch { masterContentResolve(null); }
    });

    // Carregar embed directamente — sem play button, sem Cloudflare
    await page1.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    console.log('[scraper] Embed carregado, a aguardar stream...');

    const deadline = Date.now() + 15000;
    while (!masterUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    // Aguardar conteúdo do master.m3u8 (máx 3s extra)
    const masterContent = await Promise.race([
      masterContentPromise,
      new Promise(r => setTimeout(() => r(null), 3000))
    ]);

    await page1.close();
    page1 = null;

    if (!masterUrl) { console.log('[scraper] Stream não capturado'); return null; }

    console.log('[scraper] Stream capturado:', masterUrl.substring(0, 80));
    console.log('[scraper] Master content:', masterContent ? `${masterContent.length} bytes` : 'não capturado');

    const bestUrl = masterContent
      ? parseBestQuality(masterContent, masterUrl)
      : masterUrl;

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
