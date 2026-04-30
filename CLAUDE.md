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
- `scraper.js` — fetch API com cache, dedup, protecção de sobrecarga e selecção de qualidade
- `health.js` — health checks periódicos à API + sistema de alertas

## Fluxo do Scraper
1. `GET streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv[&season&episode]`
   - Headers obrigatórios: `Referer: https://brightpathsignals.com/embed/movie/{id}`, `Origin: https://brightpathsignals.com`, `X-Requested-With: XMLHttpRequest`
2. Resposta JSON → `data.stream_urls[]` testados em paralelo
3. `parseMasterPlaylist()` extrai todas as variantes de qualidade (4K/2K/1080p/720p/480p) da master `.m3u8`
4. Se CDN bloquear pré-fetch (403), retorna URL directo com qualidade `Auto`
5. Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Fluxo de Health Checks
1. A cada 5 min (configurável), testa a API vaplayer com pedido real
2. Se falhar por mais de 5 min → dispara alerta (webhook/email)
3. Quando recuperar → dispara alerta de recuperação
4. Estado acessível em `/health`

## Env Vars
| Variável | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `CACHE_TTL_MS` | `300000` (5min) |
| `MAX_QUEUE` | `3` |
| `MAX_SEG_RETRIES` | `1` (retries on 502/403) |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` (5min) |
| `ALERT_WEBHOOK` | — (Slack/Discord webhook) |
| `ALERT_EMAIL` | — (requer nodemailer) |

## Padrões
- CommonJS (`require`). `try/catch` em todos os handlers. Séries: `tt1234567:1:2` → split.

## Branches
- `main` / `Experimental` — em sync, v1.1.1 em produção (Render)
- `backup/working-v1` — backup estável com Puppeteer

## Notas
- Séries: alguns CDNs bloqueiam pré-fetch (403) — não afecta playback, Stremio gere qualidade.
- Séries no Render: embed CDN bloqueia IPs de datacenter — funciona localmente.
- Legendas: bloqueadas por Cloudflare no Render — ver PROMPT.md para roadmap.
- bingeGroup activo — mostra ecrã "próximo episódio" mas requer clique (auto-play pleno requer proxy doméstico para legendas).
