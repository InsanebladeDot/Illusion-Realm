/** Read-only download diagnosis: compare Chromium redirects with Node and probe public responses without credentials. */
const http = require("node:http");
const { app, net } = require("electron");
const { fetchDownload } = require("../apps/electron/services/model-download-transfer");
const { getDownloadSession } = require("../apps/electron/services/model-download-network");
const timer = setTimeout(() => app.exit(124), 60000);

async function probe(label, fetcher, url) {
  try {
    const response = await fetcher(url, { redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15000) });
    const location = response.headers.get("location");
    console.log(JSON.stringify({ label, status: response.status, type: response.type, contentType: response.headers.get("content-type"), redirectHost: location ? new URL(location, url).hostname : null, hasBody: Boolean(response.body) }));
    await response.body?.cancel();
  } catch (error) {
    console.log(JSON.stringify({ label, error: error.name, code: error.cause?.code || null, message: String(error.message).replace(/https?:\/\/\S+/g, "[URL]") }));
  }
}

async function main() {
  await app.whenReady();
  const server = http.createServer((request, response) => {
    if (request.url === "/file") { response.writeHead(200, { "Content-Type": "application/octet-stream" }); response.end("fixture"); return; }
    response.writeHead(302, { Location: "/file" }); response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/redirect`;
    await probe("local-electron", net.fetch, url);
    await probe("local-node", globalThis.fetch, url);
    await probe("local-direct-electron", net.fetch, url.replace("/redirect", "/file"));
  } finally { server.close(); }
  const versionId = process.argv.slice(2).find((value) => /^\d+$/.test(value)) || "3226360";
  const downloadPath = "/api/download/models/" + versionId;
  await Promise.allSettled([probe("red-electron", net.fetch, "https://civitai.red" + downloadPath), probe("red-node", globalThis.fetch, "https://civitai.red" + downloadPath), probe("official-electron", net.fetch, "https://civitai.com" + downloadPath)]);
  getDownloadSession().webRequest.onHeadersReceived((details, callback) => {
    const url = new URL(details.url);
    console.log(JSON.stringify({ label: "fixed-hop", host: url.hostname, path: url.pathname, status: details.statusCode }));
    callback({});
  });
  try {
    const response = await fetchDownload("https://civitai.red" + downloadPath, AbortSignal.timeout(15000));
    console.log(JSON.stringify({ label: "fixed-download", status: response.status, contentType: response.headers.get("content-type") }));
    if (/html/i.test(response.headers.get("content-type") || "") && response.body) {
      const reader = response.body.getReader();
      const chunk = await reader.read();
      const title = chunk.value ? Buffer.from(chunk.value).toString("utf8").match(/<title>([^<]{0,120})<\/title>/i)?.[1] : undefined;
      console.log(JSON.stringify({ label: "fixed-page", title }));
      await reader.cancel(); reader.releaseLock();
    } else await response.body?.cancel();
  } catch (error) { console.log(JSON.stringify({ label: "fixed-download", error: error.message })); }
  clearTimeout(timer);
  app.exit(0);
}
main().catch((error) => { console.log(JSON.stringify({ error: error.name })); app.exit(1); });
