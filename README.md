# StreamIMDb Connector — Stremio Add-on

Add-on local para o Stremio que extrai streams de vídeo directamente do [streamimdb.me](https://streamimdb.me) e os reproduz no player nativo do Stremio, sem abrir o browser.

## Como funciona

1. Clicas num filme ou série no Stremio
2. O add-on recebe o IMDb ID (ex: `tt0076759`)
3. Um browser headless (Puppeteer) navega para o `streamimdb.me` em segundo plano
4. Captura o URL real do stream `.m3u8`
5. Devolve-o ao Stremio para reprodução nativa

## Requisitos

- [Node.js](https://nodejs.org) v18+
- Windows, macOS ou Linux

## Instalação

```bash
git clone https://github.com/F100Pilot/stremio-addon-streamimdb.git
cd stremio-addon-streamimdb
npm install
```

## Utilização

```bash
node server.js
```

O servidor inicia em `http://localhost:7000`.

Para instalar no Stremio, abre o Stremio e adiciona o add-on pelo URL:
```
http://localhost:7000/manifest.json
```

## Notas

- O primeiro stream demora ~20-30 segundos (o browser headless precisa de carregar as páginas)
- Suporta filmes e séries
- Fallback automático para abrir no browser se o stream não for capturado

## Estrutura

```
server.js   — servidor HTTP na porta 7000
addon.js    — manifesto e handler do Stremio SDK
scraper.js  — lógica Puppeteer para capturar o stream
```
