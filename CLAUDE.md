# Stremio Add-on — StreamIMDb Connector v1.0.1

## Comandos
```
npm install
node server.js       # porta 7000 (local) ou process.env.PORT (Render)
curl http://localhost:7000/manifest.json
curl "http://localhost:7000/stream/movie/tt0076759.json"
```
Porta ocupada: `powershell -Command "$c=Get-NetTCPConnection -LocalPort 7000 -EA SilentlyContinue; if($c){taskkill /F /PID $c.OwningProcess}"`

## Stack
`stremio-addon-sdk` · `express` · `puppeteer` (Chrome bundled em `~/.cache/puppeteer`)

## Estrutura
- `server.js` — express + `getRouter(addon)` + landing page customizada em `/`
- `addon.js` — manifesto (`org.local.streamimdb` v1.0.1) + `defineStreamHandler`
- `scraper.js` — Puppeteer com cache, deduplicação, env vars e protecção de sobrecarga
- `package.json` — dependências principais

## Fluxo do Scraper
- **Filmes:** `player.mov2day.xyz/movie/{imdbId}` → clica `#play-btn` → captura `.m3u8`
- **Séries:** `cdn.mov2day.xyz/embed/tv/{imdbId}/{season}/{episode}` → captura `.m3u8` directamente
- Interceta resposta `master.m3u8` no browser → parseia para obter maior qualidade
- Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Environment Variables (opcionais)
| Variável | Default |
|---|---|
| `MOVIE_PLAYER_URL` | `https://player.mov2day.xyz/movie` |
| `TV_EMBED_URL` | `https://cdn.mov2day.xyz/embed/tv` |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Padrões
- CommonJS (`require`). Sem `import`.
- `try/catch` em todos os handlers; erro → `{ streams: [] }`.
- Séries: `args.id` = `tt1234567:1:2` → split para imdbId, season, episode.

## Branches
- `main` — versão estável em produção (Render)
- `Experimental` — v1.0.1 com cache+dedup+env vars+fixes
- `backup/working-v3` — último backup estável confirmado

## Notas
- Puppeteer tem problema de escala com tráfego público — ver PROMPT.md para Opção A (eliminar Puppeteer via reverse-engineering de API).
- Séries não funcionam no Render (datacenter IP bloqueado pelo CDN) — funcionam localmente.
- Legendas: bloqueadas por Cloudflare Turnstile — ver CONTEXT.md.
