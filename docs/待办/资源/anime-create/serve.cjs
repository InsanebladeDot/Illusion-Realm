// Serve only the standalone page on loopback; no repository files are exposed.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname !== '/' && pathname !== '/index.html') {
      response.writeHead(404); response.end('Not found'); return;
    }
    const html = await fs.readFile(path.join(__dirname, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch (error) {
    console.error(error.message); response.writeHead(500); response.end('Preview unavailable');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4179, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4179/'));
