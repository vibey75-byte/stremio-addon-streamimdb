# StreamIMDb Connector — Estado (v1.1.1)

## Deploy
Render (`stremio-addon-streamimdb.onrender.com`) · branch `main`
Landing page em `/` — donativo paypal.me/F100Pilot · reporte pflm.bet@gmail.com

## Stack
`axios` + `stremio-addon-sdk` + `express` · sem browser/Puppeteer

## Fluxo actual
1. Stremio envia IMDb ID → `defineStreamHandler` em `addon.js`
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv` com headers `Referer/Origin` de `brightpathsignals.com`
3. JSON devolve `data.stream_urls[]` — testados em paralelo; primeiro verificado (200) ou acessível (4xx) é usado
4. Se CDN bloquear pré-fetch (403), URL é passado directamente ao Stremio — funciona na mesma
5. Cache 2h + deduplicação de pedidos + rejeição por sobrecarga (`MAX_QUEUE=3`)

## Implementado
- Fallback automático entre todos os `stream_urls[]` ✓
- `/health` endpoint (uptime, cache, memória) ✓
- Puppeteer eliminado → axios puro (<5s, ~5MB RAM) ✓

## Em aberto

| Prioridade | Feature | Notas |
|---|---|---|
| Alta | **Legendas** | OpenSubtitles e Subdl testados — endpoint `/download` bloqueado por Cloudflare em IPs de datacenter (Render e Cloudflare Workers). Solução viável: proxy doméstico (IP residencial). |
| Média | **Catalog básico** | Conteúdos populares/recentes para o add-on ser descobrível dentro do Stremio. |
| Baixa | **Qualidade selecionável** | Expor múltiplos streams (1080p, 720p…) em vez de só o melhor automático. |
