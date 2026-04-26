# Projeto: Stremio Add-on - StreamIMDb Connector

## Objetivo

Add-on local para Stremio que converte IDs do IMDb em streams de vídeo diretos usando o site `streamimdb.me` como fonte. O Stremio fornece o IMDb ID, o add-on automatiza um browser headless para extrair o URL real do stream `.m3u8` e devolvê-lo ao player nativo do Stremio.

## Lógica de Negócio (implementada)

1. Stremio fornece o IMDb ID (ex: `tt0076759`). Para séries vem no formato `tt1234567:1:2` — fazer split e usar só o `tt`.
2. O add-on navega via Puppeteer para `https://streamimdb.me/embed/{id}/`.
3. Captura o URL gerado dinamicamente para `cloudnestra.com/rcp/...` (player intermédio).
4. Navega para esse URL do Cloudnestra e clica no botão `#pl_but` (play).
5. Interceta os pedidos de rede e captura o primeiro URL `.m3u8` — esse é o stream real.
6. Devolve o `.m3u8` ao Stremio como `url` (reprodução nativa no player).
7. Fallback: se o scraping falhar, devolve `externalUrl` para `streamimdb.me/embed/{id}/`.

## Stack Tecnológica

- `stremio-addon-sdk` — manifesto e handlers.
- `puppeteer` — browser headless para navegar, clicar e intercectar rede.
- `axios` + `cheerio` — mantidos como dependências (não usados ativamente no fluxo principal).
- Porta: **7000** (localhost).

## Regras de Implementação

- **ID Prefix:** Sempre `tt`.
- **User-Agent:** Usar User-Agent de Chrome real em todos os pedidos do Puppeteer.
- **Resiliência:** Nunca crashar; retornar `{ streams: [] }` em erro crítico.
- **Browser:** O Puppeteer usa o Chrome bundled (instalado em `~/.cache/puppeteer`). Se o sistema tiver Chrome ou Edge instalado, o `getBrowserPath()` usa-o em alternativa.
- **Tempo de resposta:** Cada pedido de stream demora ~20-30 segundos (carregamento das páginas + clique + captura do m3u8). O Stremio aguarda tempo suficiente.

## Estrutura de Ficheiros

- `server.js` — entrada; chama `serveHTTP` na porta 7000.
- `addon.js` — manifesto + `defineStreamHandler` para `movie` e `series`.
- `scraper.js` — lógica Puppeteer: navega → Cloudnestra → clica play → captura `.m3u8`.
- `package.json` — dependências: `stremio-addon-sdk`, `puppeteer`, `axios`, `cheerio`.

---

## Integração Futura: Legendas Internas

### O que foi investigado

O player do Cloudnestra (página `cloudnestra.com/prorcp/...`, carregada como iframe após clicar play) inclui um sistema de legendas integrado com dados do OpenSubtitles.

### Fluxo técnico das legendas

1. Após clicar play, o iframe `prorcp` carrega o script `subtitles_pjs_24.04.js`.
2. Quando o utilizador seleciona uma língua, o script faz um XHR GET para:
   `https://jejunejamboree.website/content/<content_hash>/<track_hash>/page-0.html`
   — o ficheiro é binário comprimido com **zlib/deflate** (biblioteca `pako`).
3. O script descomprime com `pako.inflate(xhr.response, { to: 'string' })` e obtém texto SRT ou VTT.
4. Faz um POST para `https://cloudnestra.com/get_sub_url` com os dados comprimidos e metadados (`sub_id`, `sub_enc`, `sub_src`, `subformat`) extraídos de atributos `data-*` dos elementos no DOM do iframe.
5. O servidor responde com um URL direto para o ficheiro de legenda convertido (ex: `.../subtitle.vtt`).
6. Esse URL seria incluído no objeto de stream do Stremio como:
   ```js
   subtitles: [{ id: 'en', url: 'https://.../subtitle.vtt', lang: 'English' }]
   ```

### Bloqueio atual

O iframe `prorcp` (que contém o menu de legendas e o player) está protegido por **Cloudflare Turnstile** — sistema anti-bot que detecta o Puppeteer e bloqueia o carregamento do iframe. O stream de vídeo não é afetado porque usa uma rota diferente.

### O que é necessário para implementar

- Instalar `puppeteer-extra` + `puppeteer-extra-plugin-stealth` para contornar a deteção do Cloudflare.
- Após o play ser clicado e o iframe `prorcp` carregar, aceder ao frame via `page.frames().find(f => f.url().includes('prorcp'))`.
- Clicar num elemento de legenda dentro do frame (ex: `.subtitles_window > div` que contenha "English").
- Intercectar a resposta do POST a `/get_sub_url` para obter o URL final da legenda.
- Incluir os URLs capturados no campo `subtitles` do objeto de stream devolvido ao Stremio.
