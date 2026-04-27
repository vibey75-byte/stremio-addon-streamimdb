const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;
const app = express();

app.use(getRouter(addonInterface));

app.get('/', (req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StreamIMDb Connector</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f13; color: #e0e0e0;
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 16px;
      padding: 40px; max-width: 520px; width: 100%;
      box-shadow: 0 8px 40px rgba(0,0,0,0.4);
    }
    .logo { width: 72px; height: 72px; border-radius: 16px; margin-bottom: 20px; }
    h1 { font-size: 1.6rem; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .version { font-size: 0.8rem; color: #666; margin-bottom: 12px; }
    p { color: #999; font-size: 0.95rem; line-height: 1.5; margin-bottom: 28px; }
    .btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px 22px; border-radius: 10px; font-size: 0.95rem; font-weight: 600;
      text-decoration: none; border: none; cursor: pointer;
      width: 100%; margin-bottom: 12px; transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-install { background: #7b3fe4; color: #fff; }
    .btn-donate  { background: #003087; color: #fff; }
    .divider { border: none; border-top: 1px solid #2a2a3a; margin: 24px 0; }
    .label { font-size: 0.9rem; font-weight: 600; color: #ccc; margin-bottom: 12px; }
    textarea {
      width: 100%; background: #0f0f13; border: 1px solid #2a2a3a;
      border-radius: 10px; color: #e0e0e0; padding: 12px; font-size: 0.9rem;
      resize: vertical; min-height: 90px; font-family: inherit; margin-bottom: 10px;
    }
    textarea:focus { outline: none; border-color: #7b3fe4; }
    .btn-report { background: #2a2a3a; color: #ccc; font-size: 0.9rem; }
    .footer { margin-top: 24px; font-size: 0.75rem; color: #444; text-align: center; }
    .footer a { color: #666; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png" alt="icon">
    <h1>StreamIMDb Connector</h1>
    <div class="version">v1.1.0 &nbsp;·&nbsp; Movies &amp; Series</div>
    <p>Stream movies and series natively inside Stremio — no browser required.</p>
    <a class="btn btn-install" id="install-btn" href="#">&#9654; Install in Stremio</a>
    <a class="btn btn-donate" href="https://paypal.me/F100Pilot" target="_blank">&#9829; Donate via PayPal</a>
    <hr class="divider">
    <div class="label">Report an issue</div>
    <textarea id="msg" placeholder="Describe the issue (e.g. movie title, what happened)..."></textarea>
    <a id="report-btn" class="btn btn-report" href="#">&#9993; Send Report</a>
  </div>
  <div class="footer">
    <a href="/manifest.json">manifest.json</a> &nbsp;·&nbsp;
    <a href="https://github.com/F100Pilot/stremio-addon-streamimdb" target="_blank">GitHub</a>
  </div>
  <script>
    document.getElementById('install-btn').href = 'stremio://' + window.location.host + '/manifest.json';
    document.getElementById('report-btn').addEventListener('click', function(e) {
      e.preventDefault();
      const msg = document.getElementById('msg').value.trim();
      if (!msg) { alert('Please describe the issue first.'); return; }
      window.location.href = 'mailto:pflm.bet@gmail.com?subject=' + encodeURIComponent('StreamIMDb Report') + '&body=' + encodeURIComponent(msg);
    });
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Add-on disponível em http://localhost:${PORT}/manifest.json`);
  console.log(`HTTP addon accessible at: http://127.0.0.1:${PORT}/manifest.json`);
});
