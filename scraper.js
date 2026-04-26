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

// Parsear master.m3u8 e devolver o URL da stream com maior BANDWIDTH
async function getHighestQualityStream(masterUrl) {
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
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;
        const streamLine = lines[i + 1]?.trim();
        if (streamLine && bandwidth >= bestBandwidth) {
          bestBandwidth = bandwidth;
          // Resolver URL relativo se necessário
          best = streamLine.startsWith('http')
            ? streamLine
            : new URL(streamLine, masterUrl).href;
        }
      }
    }

    if (best) {
      console.log(`[scraper] Melhor qualidade: ${bestBandwidth / 1000}kbps → ${best.substring(0, 80)}`);
      return best;
    }
  } catch (err) {
    console.log('[scraper] Erro ao parsear master.m3u8:', err.message);
  }
  return masterUrl; // fallback: devolver o master se falhar
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) {
    throw new Error(`ID IMDb inválido: ${imdbId}`);
  }

  const embedUrl = type === 'series'
    ? `${EMBED_BASE}/${imdbId}/${season}-${episode}/`
    : `${EMBED_BASE}/${imdbId}/`;

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: getBrowserPath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
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

    await page1.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    await page1.close();

    if (!cloudnestraUrl) {
      console.log('[scraper] Cloudnestra URL não encontrado');
      return null;
    }

    // Passo 2: navegar para Cloudnestra, clicar play, capturar master.m3u8
    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page2.setExtraHTTPHeaders({ 'Referer': 'https://streamimdb.me/' });
    await page2.setRequestInterception(true);

    let masterUrl = null;
    page2.on('request', req => {
      const url = req.url();
      if (url.includes('.m3u8')) {
        if (!masterUrl) masterUrl = url;
        else if (!masterUrl.includes('master') && url.includes('master')) masterUrl = url;
      }
      req.continue();
    });

    await page2.goto(cloudnestraUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page2.click('#pl_but').catch(() => {});
    console.log('[scraper] Play clicado, a aguardar stream...');

    const deadline = Date.now() + 15000;
    while (!masterUrl && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    await page2.close();

    if (!masterUrl) {
      console.log('[scraper] Stream não capturado após clique');
      return null;
    }

    console.log('[scraper] Master URL capturado:', masterUrl.substring(0, 80));

    // Passo 3: parsear o master.m3u8 e obter a qualidade mais alta
    const bestUrl = await getHighestQualityStream(masterUrl);
    return { url: bestUrl, type: 'direct' };

  } catch (err) {
    console.error('[scraper] Erro:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchVideoSource };
