# StreamIMDb Connector — Estado (v1.1.0)

## Deploy
Render (`stremio-addon-streamimdb.onrender.com`) · branch `main`
Landing page em `/` — donativo paypal.me/F100Pilot · reporte pflm.bet@gmail.com

## Stack
`axios` + `stremio-addon-sdk` + `express` · sem browser/Puppeteer

## Fluxo actual
1. Stremio envia IMDb ID → `defineStreamHandler` em `addon.js`
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv` com headers `Referer/Origin` de `brightpathsignals.com`
3. JSON devolve `data.stream_urls[]` — master `.m3u8` de CDNs variados
4. `fetchMaster()` tenta seleccionar maior BANDWIDTH; se CDN bloquear (403), retorna URL direto (funciona na mesma no Stremio)
5. Cache 2h + deduplicação de pedidos + rejeição por sobrecarga (`MAX_QUEUE=3`)

## v1.1.0 vs v1.0
- Puppeteer eliminado; RAM 150MB → ~5MB; latência 25s → <5s; 192 packages removidos

## Em aberto
- **Legendas:** iframe `prorcp` bloqueado por Cloudflare Turnstile. Requer stealth + interceptar POST `/get_sub_url` (Brotli+pako). Ver CONTEXT.md.
- **Séries no Render:** embed CDN bloqueia IPs de datacenter — stream da API vaplayer funciona, mas `fetchMaster` bloqueado (403). Funciona localmente.
