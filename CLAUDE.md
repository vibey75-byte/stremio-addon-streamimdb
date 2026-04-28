# StreamIMDb Connector v1.1.1

## Comandos
```
npm install
node server.js       # porta 7000 ou process.env.PORT (Render)
curl "http://localhost:7000/stream/movie/tt0076759.json"
```
Porta ocupada: `powershell -Command "$c=Get-NetTCPConnection -LocalPort 7000 -EA SilentlyContinue; if($c){taskkill /F /PID $c.OwningProcess}"`

## Stack
`stremio-addon-sdk` · `express` · `axios`

## Estrutura
- `server.js` — express + `getRouter(addon)` + landing page em `/`
- `addon.js` — manifesto `org.local.streamimdb` v1.1.1 + `defineStreamHandler`
- `scraper.js` — fetch API com cache, dedup e protecção de sobrecarga

## Fluxo do Scraper
1. `GET streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv[&season&episode]`
   - Headers obrigatórios: `Referer: https://brightpathsignals.com/embed/movie/{id}`, `Origin: https://brightpathsignals.com`, `X-Requested-With: XMLHttpRequest`
2. Resposta JSON → `data.stream_urls[0]` = master `.m3u8`
3. `fetchMaster()` tenta seleccionar melhor qualidade via BANDWIDTH; se CDN bloquear (403), usa URL direto — Stremio gere HLS nativamente
4. Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Env Vars
| Variável | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Padrões
- CommonJS (`require`). `try/catch` em todos os handlers. Séries: `tt1234567:1:2` → split.

## Branches
- `main` / `Experimental` — em sync, v1.1.1 em produção (Render)
- `backup/working-v1` — backup estável com Puppeteer

## Notas
- Séries: alguns CDNs bloqueiam `fetchMaster` (403) — não afecta playback, Stremio gere qualidade.
- Séries no Render: embed CDN bloqueia IPs de datacenter — funciona localmente.
- Legendas: bloqueadas por Cloudflare Turnstile — ver CONTEXT.md.
