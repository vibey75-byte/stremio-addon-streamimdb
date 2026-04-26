const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

serveHTTP(addonInterface, { port: 7000 });

console.log('Add-on disponível em http://localhost:7000/manifest.json');
