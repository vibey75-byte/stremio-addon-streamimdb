# StreamIMDb Connector — Estado do Projeto (v1.0.1)

## O que está feito

Add-on Stremio público que extrai streams diretos (`.m3u8`) via Puppeteer a partir do `player.mov2day.xyz` (filmes) e `cdn.mov2day.xyz/embed/tv` (séries).

**Fluxo actual:**
- Filmes: `player.mov2day.xyz/movie/{imdbId}` → clica `#play-btn` → captura `.m3u8`
- Séries: `cdn.mov2day.xyz/embed/tv/{imdbId}/{season}/{episode}` → captura `.m3u8` directamente

**Ficheiros:** `server.js`, `addon.js`, `scraper.js`, `package.json`
**Manifesto ID:** `org.local.streamimdb` | **Versão:** `1.0.1`
**Deploy:** Render (`stremio-addon-streamimdb.onrender.com`) — branch `main`
**Branch experimental:** `Experimental` — com cache, deduplicação e env vars

## Stack actual
- `puppeteer` — browser headless (Chrome bundled em `~/.cache/puppeteer`)
- `stremio-addon-sdk` + `express` — servidor e manifesto
- Landing page em `/` com botão de donativo (paypal.me/F100Pilot) e campo de reporte (pflm.bet@gmail.com)

## Melhorias implementadas (branch Experimental / v1.0.1)
- **Cache em memória** (2h TTL) — mesmo conteúdo não é scraped duas vezes
- **Deduplicação** — múltiplos pedidos do mesmo conteúdo fazem apenas 1 scrape
- **Protecção de sobrecarga** — rejeita imediatamente se mais de 3 scrapes activos (`MAX_QUEUE`)
- **Environment variables** — URLs das fontes configuráveis sem redeploy:
  - `MOVIE_PLAYER_URL` (default: `https://player.mov2day.xyz/movie`)
  - `TV_EMBED_URL` (default: `https://cdn.mov2day.xyz/embed/tv`)
  - `CACHE_TTL_MS` (default: 7200000)
  - `MAX_QUEUE` (default: 3)
- **Fallback title** alterado para "No stream available" em vez de "Abrir no browser"
- **Auto-advance fix** — semáforo com timeout de 25s e force reset do browser se preso

## Problema de escalabilidade (Puppeteer)

Com tráfego público elevado (publicado no Reddit), o Puppeteer sobrecarrega o servidor:
- Cada scrape lança/usa um Chrome (~150-200MB RAM, ~25s por pedido)
- Render free tem 512MB RAM → máx 1-2 utilizadores simultâneos
- A cache e deduplicação ajudam mas não resolvem o problema fundamental

## Próximo passo prioritário: Opção A — Eliminar o Puppeteer

### Objectivo
Substituir o Puppeteer por chamadas HTTP puras (`axios`), reverse-engineering a cadeia de APIs que o player usa internamente. Resultado: resposta em <1s, escalabilidade infinita, funciona em qualquer servidor.

### O que já sabemos (investigação prévia)

**Fonte actual:** `player.mov2day.xyz` + `cdn.mov2day.xyz/embed`

**Cadeia de pedidos capturada localmente:**
1. `cdn.mov2day.xyz/embed/movie/{imdbId}` → carrega iframe
2. Dentro do iframe: `streamdata.vaplayer.ru/api.php?imdb={imdbId}&type=movie` → devolve URL do stream encriptado
3. Player desencripta via JavaScript e carrega `master.m3u8` de CDNs como `highperformancebrands.site`, `sustainableprofitlab.site`, etc.

**API do moviesapi.to (testada e funcional com IMDb IDs):**
- `GET https://ww2.moviesapi.to/api/movie/{imdbId}` → `{ video_url: "https://player.mov2day.xyz/movie/{id}", ... }`
- `GET https://ww2.moviesapi.to/api/movie/{imdbId}` com IMDb IDs funciona directamente

**API do streamdata.vaplayer.ru:**
- `GET https://streamdata.vaplayer.ru/api.php?imdb={imdbId}&type=movie` → resposta com URL ou dados encriptados do stream
- **Não testada directamente com axios** — este é o passo crítico a investigar

### O que falta investigar
1. Fazer `axios.get('https://streamdata.vaplayer.ru/api.php?imdb=tt0076759&type=movie')` e analisar a resposta
2. Se a resposta contiver o m3u8 directamente → substituição imediata do Puppeteer
3. Se a resposta for encriptada → analisar o JavaScript do player para encontrar a chave/algoritmo de desencriptação
4. Testar o mesmo para séries: `?imdb={imdbId}&type=tv&season={s}&episode={e}` (formato a confirmar)

### Impacto esperado
- Tempo de resposta: **25s → <1s**
- RAM por pedido: **150MB → ~5MB**
- Utilizadores simultâneos: **1-2 → ilimitado**
- Sem Chrome, sem Puppeteer, sem problemas de IP/Cloudflare no scraping

## Trabalho em aberto (secundário)
- **Legendas internas:** bloqueadas por Cloudflare Turnstile. Ver CONTEXT.md para detalhes técnicos.
- **Séries no Render:** `cdn.mov2day.xyz` funciona localmente mas não em cloud — mesmo problema de CDN a bloquear datacenter IPs.
