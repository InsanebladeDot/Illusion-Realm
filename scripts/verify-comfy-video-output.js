/** 真实 HTTP 与生产解析器回归；使用官方 images 视频回包形状，不运行 GPU 或改动用户任务。 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { createRequire } = require('node:module');
const nextRequire = createRequire(path.resolve('apps/next/package.json'));
const ts = nextRequire('typescript');
const { generateWithComfy, collectOutputFiles } = require('../apps/electron/src/main/modules/comfy/proxy');
const videoBytes = fs.readFileSync('scripts/fixtures/video-composition/video.mp4');
const imageBytes = fs.readFileSync('scripts/fixtures/video-composition/image.png');
const prompt = { '73': { class_type: 'LoadVideo', inputs: {} }, '76': { class_type: 'SaveVideo', inputs: {} } };
let outputKey = 'images', server, address, raw, checked = 0;

/** 生产 TS 只擦除类型；仅替换桌面环境判断，IPC 解包仍执行正式实现。 */
function loadRenderer(file, bridge) {
  const result = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = name => {
    if (name === '@/i18n') return { t: key => key };
    if (name === '@/utils/electronBridge') return { isElectronEnvironment: () => true };
    if (name === '@/utils/ipcResult') return loadRenderer('apps/next/src/utils/ipcResult.ts', bridge);
    throw Error('Unexpected renderer dependency: ' + name);
  };
  new Function('exports', 'require', 'window', source)(result, require, { electronAPI: bridge });
  return result;
}

function history() {
  return { fixture: { status: { completed: true }, outputs: {
    '73': { images: [{ filename: 'source.mp4', subfolder: '', type: 'input', metadata: { kind: 'video' } }], animated: [true] },
    '76': { [outputKey]: [{ filename: 'result.MP4', subfolder: 'video', type: 'output', metadata: { kind: 'video' } }], animated: [true] },
    '80': { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] },
  } } };
}

function serve(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/view') {
    const video = url.searchParams.get('filename').toLowerCase().endsWith('.mp4');
    response.writeHead(200, { 'Content-Type': video ? 'video/mp4' : 'image/png' });
    return response.end(video ? videoBytes : imageBytes);
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(url.pathname === '/prompt' ? { prompt_id: 'fixture' } : history()));
}

function check(label, condition) { assert(condition, label); checked++; console.log('PASS', label); }

async function checkTransport(transport) {
  for (const key of ['images', 'videos']) {
    outputKey = key;
    const result = await transport.generateVideoWithComfy(prompt, { serverAddress: address });
    try {
      check(`${key}: only saved result reaches renderer, input preview excluded`, result.videos.length === 1 && result.videos[0].nodeId === '76');
      const video = result.videos[0];
      check(`${key}: actual MP4 bytes and output folder survive transport`, video.blob.type === 'video/mp4' && video.folderType === 'output' && video.subfolder === 'video' && Buffer.from(await video.blob.arrayBuffer()).equals(videoBytes));
      check(`${key}: image preview remains an image`, raw.images.length === 1 && raw.images[0].filename === 'preview.png');
      check(`${key}: proxy preserves source identity without classifying it as an image`, raw.videos.length === 2 && raw.videos.some(item => item.nodeId === '73' && item.folderType === 'input'));
    } finally { transport.revokeComfyVideos(result.videos); }
  }
}

function checkParsing() {
  const files = collectOutputFiles({ outputs: { '1': { images: [null, true, {}, { filename: 'clip.webm', type: 'temp' }, { filename: 'still.webp', type: 'output' }] } } });
  check('Malformed UI items ignored, WebM classified as video, WebP preserved', files.length === 2 && files[0].kind === 'videos' && files[0].folderType === 'temp' && files[1].kind === 'images');
}

async function main() {
  server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = `127.0.0.1:${server.address().port}`;
  const transport = loadRenderer('apps/next/src/api/comfyui/transport.ts', {
    comfyGenerate: async () => { raw = await generateWithComfy(address, prompt); return { success: true, data: raw }; },
  });
  try {
    checkParsing();
    await checkTransport(transport);
    console.log('COMFY_VIDEO_OUTPUT_OK', { checked, gpuInference: false });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
