# Stremio Add-on — StreamIMDb Connector v1.1.0

## Comandos
```
npm install
node server.js       # porta 7000 (local) ou process.env.PORT (Render)
curl http://localhost:7000/manifest.json
curl "http://localhost:7000/stream/movie/tt0076759.json"
```
Porta ocupada: `powershell -Command "$c=Get-NetTCPConnection -LocalPort 7000 -EA SilentlyContinue; if($c){taskkill /F /PID $c.OwningProcess}"`

## Stack
`stremio-addon-sdk` · `express` · `axios` (HTTP puro — sem browser)

## Estrutura
- `server.js` — express + `getRouter(addon)` + landing page customizada em `/`
- `addon.js` — manifesto (`org.local.streamimdb` v1.1.0) + `defineStreamHandler`
- `scraper.js` — axios com cache, deduplicação, env vars e protecção de sobrecarga
- `package.json` — dependências principais

## Fluxo do Scraper
- **API call:** `streamdata.vaplayer.ru/api.php?imdb={id}&type=movie` (filmes) ou `&type=tv&season={s}&episode={e}` (séries)
- **Se resposta = HLS playlist** (`#EXTM3U`): parseia directamente com `parseBestQuality()`
- **Se resposta contém URL .m3u8**: extrai com regex multi-padrão, busca master para seleccionar qualidade
- **Se resposta JSON contém URL de player**: busca página do player, extrai m3u8 com regex
- **Se nenhum m3u8 encontrado**: loga primeiros 300 chars para diagnóstico, retorna null
- Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Cadeia de API descoberta
```
cdn.mov2day.xyz/embed/movie/{imdbId}
  → streamdata.vaplayer.ru/api.php?imdb={imdbId}&type=movie
  → brightpathsignals.com/embed/movie/{imdbId}
    → highperformancebrands.site/.../master.m3u8
```

## Environment Variables (opcionais)
| Variável | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Padrões
- CommonJS (`require`). Sem `import`.
- `try/catch` em todos os handlers; erro → `{ streams: [] }`.
- Séries: `args.id` = `tt1234567:1:2` → split para imdbId, season, episode.

## Branches
- `main` — versão estável em produção (Render)
- `Experimental` — v1.1.0 com API pura (Option A)
- `backup/working-v3` — último backup estável confirmado

## Notas
- Option A implementada: Puppeteer eliminado → axios puro → <1s, ~5MB/pedido vs 25s, ~150MB anterior.
- Séries não funcionam no Render (datacenter IP bloqueado pelo CDN) — funcionam localmente.
- Legendas: bloqueadas por Cloudflare Turnstile — ver CONTEXT.md.
