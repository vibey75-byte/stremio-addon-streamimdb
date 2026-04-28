# Projeto: Stremio Add-on — StreamIMDb Connector

## Objectivo

Add-on público para Stremio que extrai streams de vídeo (`.m3u8`) e os serve nativamente no player do Stremio sem abrir o browser. Publicado no Reddit com tráfego público activo.

## Lógica de Negócio Actual (v1.0.1)

1. Stremio fornece IMDb ID (ex: `tt0076759`). Séries: `tt1234567:1:2` → split por `:`.
2. **Filmes:** Puppeteer navega para `player.mov2day.xyz/movie/{imdbId}`, clica `#play-btn`, captura `.m3u8`.
3. **Séries:** Puppeteer navega para `cdn.mov2day.xyz/embed/tv/{imdbId}/{season}/{episode}`, captura `.m3u8` directamente (sem clique).
4. Interceta resposta do `master.m3u8` no browser → parseia BANDWIDTH para seleccionar maior qualidade.
5. Cache em memória (2h TTL) + deduplicação de pedidos simultâneos.
6. Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`.

## Stack

- `stremio-addon-sdk` + `express` — servidor e manifesto
- `puppeteer` — browser headless (Chrome bundled)
- Porta: `process.env.PORT || 7000`
- Deploy: Render (`stremio-addon-streamimdb.onrender.com`)

## Estrutura de Ficheiros

- `server.js` — express + `getRouter` + landing page com donativo/reporte
- `addon.js` — manifesto (`org.local.streamimdb`, v1.0.1) + stream handler
- `scraper.js` — Puppeteer + cache + dedup + env vars + protecção sobrecarga
- `package.json` — dependências

## Problema de Escalabilidade

Com tráfego público elevado (Reddit), o Puppeteer sobrecarrega:
- ~150-200MB RAM por instância Chrome
- ~25s por pedido de stream
- Render free (512MB) suporta apenas 1-2 utilizadores simultâneos
- Cache e deduplicação mitigam mas não resolvem o problema fundamental

---

## Próxima Implementação Prioritária: Opção A — Eliminar Puppeteer

### Objectivo
Substituir o Puppeteer por chamadas HTTP puras (`axios`), replicando a cadeia de APIs que o player usa internamente. Resultado: <1s por pedido, escalabilidade infinita.

### Cadeia de pedidos capturada (investigação local com Puppeteer)

Quando `cdn.mov2day.xyz/embed/movie/tt0076759` carrega, faz estes pedidos:
```
cdn.mov2day.xyz/embed/movie/tt0076759
  → streamdata.vaplayer.ru/api.php?imdb=tt0076759&type=movie   ← API CHAVE
  → brightpathsignals.com/embed/movie/tt0076759                ← player iframe
    → highperformancebrands.site/.../master.m3u8               ← stream final
```

### API crítica a investigar

`GET https://streamdata.vaplayer.ru/api.php?imdb={imdbId}&type=movie`

Esta API é chamada pelo player e presumivelmente devolve informação sobre o stream. **Não foi ainda testada directamente com axios** — este é o próximo passo.

Possíveis formatos de resposta:
- JSON com URL do m3u8 directamente → substituição imediata
- JSON com dados encriptados → necessita análise do JS do player para desencriptar
- Redirect para o stream → seguir com axios

### Para séries
Formato esperado: `?imdb={imdbId}&type=tv&season={s}&episode={e}` (a confirmar).

### API do moviesapi.to (testada e funcional)
```
GET https://ww2.moviesapi.to/api/movie/{imdbId}
→ { "video_url": "https://player.mov2day.xyz/movie/tt0076759", "tmdb_id": "...", ... }
```
Aceita IMDb IDs directamente. Pode ser útil como passo intermédio.

### Implementação sugerida (sem Puppeteer)
```js
async function fetchVideoSource(imdbId, type, season, episode) {
  const params = type === 'series'
    ? `imdb=${imdbId}&type=tv&season=${season}&episode=${episode}`
    : `imdb=${imdbId}&type=movie`;

  const res = await axios.get(`https://streamdata.vaplayer.ru/api.php?${params}`, {
    headers: { 'Referer': 'https://cdn.mov2day.xyz/', 'User-Agent': '...' }
  });

  // Analisar resposta e extrair m3u8
  // Se encriptado: aplicar algoritmo de desencriptação (a descobrir)
  return { url: m3u8Url, type: 'direct' };
}
```

### Impacto esperado
| Métrica | Puppeteer (actual) | API pura (Opção A) |
|---|---|---|
| Tempo de resposta | ~25s | <1s |
| RAM por pedido | ~150MB | ~5MB |
| Utilizadores simultâneos | 1-2 | ilimitado |
| Dependência de IP | Sim (CDN bloqueia datacenter) | Possivelmente não |

---

## Legendas Internas (bloqueadas — implementação futura)

### Fluxo técnico
1. Iframe `prorcp` do Cloudnestra carrega `subtitles_pjs_24.04.js`
2. Utilizador selecciona língua → XHR GET para `jejunejamboree.website/content/<hash>/<track>/page-0.html` (binário comprimido Brotli+pako)
3. POST para `cloudnestra.com/get_sub_url` com dados comprimidos → resposta com URL `.vtt`
4. URL incluído no stream como `subtitles: [{ id, url, lang }]`

### Bloqueio actual
Iframe `prorcp` protegido por **Cloudflare Turnstile** que detecta Puppeteer de datacenter IPs.

### O que é necessário
- `puppeteer-extra-plugin-stealth` para contornar detecção
- Aceder ao frame: `page.frames().find(f => f.url().includes('prorcp'))`
- Clicar elemento de legenda: `.subtitles_window > div` com texto "English"
- Interceptar resposta do POST `/get_sub_url`
