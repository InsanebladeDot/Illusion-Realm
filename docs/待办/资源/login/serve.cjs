// Serve only the two review pages on the local loopback interface.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const pages = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/login.html', 'login.html']]);
const server = http.createServer((request, response) => {
  const name = pages.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!name) { response.writeHead(404); response.end('Not found'); return; }
  fs.readFile(path.join(__dirname, name), (error, content) => {
    if (error) { response.writeHead(500); response.end('Preview unavailable'); return; }
    response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); response.end(content);
  });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4178, '127.0.0.1', () => console.log('Preview ready: http://127.0.0.1:4178'));
