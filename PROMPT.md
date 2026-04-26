# StreamIMDb Connector — Estado do Projeto

## O que está feito
Add-on Stremio local que extrai streams diretos (`.m3u8`) do `streamimdb.me` via Puppeteer.

**Fluxo:** IMDb ID → `streamimdb.me/embed/{id}/` → Cloudnestra player → clique `#pl_but` → `.m3u8` → Stremio player nativo.

**Ficheiros:** `server.js`, `addon.js`, `scraper.js`, `package.json`
**Manifesto ID:** `org.local.playimdb` | **Porta:** 7000

## Trabalho em aberto
- **Legendas internas:** bloqueadas por Cloudflare Turnstile no iframe `prorcp`. Solução: `puppeteer-extra-plugin-stealth`. Detalhes completos em `CONTEXT.md`.
