# Stremio Add-on — StreamIMDb Connector

## Comandos
```
npm install          # instalar dependências
node server.js       # iniciar em localhost:7000
curl http://localhost:7000/manifest.json
curl "http://localhost:7000/stream/movie/tt0076759.json"
```
Se a porta 7000 estiver ocupada: `powershell -Command "$c=Get-NetTCPConnection -LocalPort 7000; taskkill /F /PID $c.OwningProcess"`

## Stack
`stremio-addon-sdk` · `puppeteer` (Chrome bundled em `~/.cache/puppeteer`) · `axios` · `cheerio`

## Estrutura
- `server.js` — `serveHTTP(addon, { port: 7000 })`
- `addon.js` — manifesto (`org.local.playimdb`) + `defineStreamHandler` para `movie`/`series`
- `scraper.js` — Puppeteer: embed → Cloudnestra → clica `#pl_but` → captura `.m3u8`

## Padrões
- CommonJS (`require`). Sem `import`.
- Handlers envolvidos em `try/catch`; erro → `{ streams: [] }`.
- Funções de scraping com prefixo `fetch`.
- User-Agent de Chrome real em todos os pedidos.
- Séries: `args.id` vem como `tt1234567:1:2` — usar `split(':')[0]`.

## Fluxo do Scraper (`scraper.js`)
1. Puppeteer abre `https://streamimdb.me/embed/{imdbId}/`
2. Interceta pedidos → captura URL `cloudnestra.com/rcp/...`
3. Navega para esse URL (Referer: streamimdb.me), clica `#pl_but`
4. Aguarda pedido de rede com `.m3u8` → devolve `{ url, type: 'direct' }`
5. Fallback: `externalUrl` para `streamimdb.me/embed/{id}/`

## Notas
- Cada pedido de stream demora ~20-30s (Puppeteer + carregamento de páginas).
- Legendas: ver `CONTEXT.md` — bloqueadas por Cloudflare Turnstile; implementação futura via `puppeteer-extra-plugin-stealth`.
