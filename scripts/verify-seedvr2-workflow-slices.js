/** 完整原视频送本机ComfyUI，验证固定10 FPS和1秒切片、尾批余帧；不加载超分模型。 */
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { execFile } = require('node:child_process');
const { promisify } = require('node:util'), { createRequire } = require('node:module');
const execute = promisify(execFile), base = 'http://127.0.0.1:8188';
const nextRequire = createRequire(path.resolve('apps/next/package.json'));
const { planVideo } = require('../apps/electron/src/main/modules/ffmpeg/upscale-plan');

/** 只把语言读取替换为键；工作流构建与模板来自生产代码。 */
function loadWorkflow(file = path.resolve('apps/next/src/utils/comfy/seedvr2-workflow.ts')) {
  const ts = nextRequire('typescript');
  const source = ts.transpileModule(require('node:fs').readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const result = {};
  new Function('exports', 'require', source)(result, name => {
    if (name === '@/i18n') return { t: key => key };
    if (!name.startsWith('@/') && !name.startsWith('.')) return createRequire(file)(name);
    const candidates = name.startsWith('@/') ? [path.resolve('apps/next/src', name.slice(2)), path.resolve('packages/shared/src', name.slice(2))] : [path.resolve(path.dirname(file), name)];
    const found = candidates.flatMap(base => [base, base + '.ts', base + '.json']).find(file => require('node:fs').existsSync(file));
    if (!found) throw Error('Workflow module not found: ' + name);
    return found.endsWith('.json') ? nextRequire(found) : loadWorkflow(found);
  });
  return result;
}

async function call(route, options) {
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`ComfyUI HTTP ${response.status}: ${await response.text()}`);
  return response;
}

/** 只等待自己的请求，不中断服务里其他任务；任何节点错误立即失败。 */
async function resultFor(id) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const item = (await (await call('/history/' + id)).json())[id];
    if (item?.status?.status_str === 'error') throw Error(JSON.stringify(item.status));
    if (item?.outputs?.['76']) return item.outputs['76'];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Workflow slice timed out');
}

async function uploadSource(source) {
  const form = new FormData();
  form.append('image', new Blob([await fs.readFile(source)], { type: 'video/mp4' }), `ir-full-source-${Date.now()}.mp4`);
  const upload = await (await call('/upload/image', { method: 'POST', body: form })).json();
  return [upload.subfolder, upload.name].filter(Boolean).join('/');
}

async function runBatch(workflow, name, batch, directory, index, reference, batchFrames) {
  const graph = workflow.seedvr2VideoBatch(workflow.buildSeedvr2Prompt(name, 'video', { ...workflow.DEFAULT_UPSCALE, enabled: true, batchFrames }), batch.startTime, batch.frames);
  // 保留实际重组和切片链；只绕过GPU模型，尾批仍走生产兼容节点。
  const ids = ['73', '113:111', '113:112', '113:115', '66:79', '66:81', '66:74', '66:75', '76'];
  if (graph.ir_tail_video) ids.push('ir_tail_video');
  const prompt = Object.fromEntries(ids.map(id => [id, graph[id]]));
  prompt['66:75'].inputs.images = ['66:74', 0];
  prompt['76'].inputs.filename_prefix = `IllusionRealmTests/workflow-slice-${Date.now()}-${index}`;
  const submitted = await (await call('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'ir-slice-regression' }) })).json();
  const output = await resultFor(submitted.prompt_id);
  const video = [...output.images ?? [], ...output.videos ?? []].find(item => /\.mp4$/i.test(item.filename));
  assert(video, 'SaveVideo must produce an MP4');
  const response = await call('/view?' + new URLSearchParams(video));
  const file = path.join(directory, `batch-${index}.mp4`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  const { stdout } = await execute(path.resolve('apps/electron/bin/ffmpeg/ffprobe.exe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,avg_frame_rate', '-of', 'json', file], { windowsHide: true });
  const stream = JSON.parse(stdout).streams[0];
  assert.equal(Number(stream.nb_frames), batch.frames);
  assert.equal(stream.avg_frame_rate, `${batchFrames}/1`);
  const decoded = await frameValues(file);
  const indices = decoded.map(value => reference.reduce((best, expected, candidate) => Math.abs(expected - value) < Math.abs(reference[best] - value) ? candidate : best, 0));
  assert.deepEqual(indices, Array.from({ length: batch.frames }, (_, i) => batch.startFrame + i));
  console.log('PASS_REAL_WORKFLOW_SLICE', { startFrame: batch.startFrame, frames: Number(stream.nb_frames), fps: batchFrames });
}

/** 每帧亮度是独立编号，允许封装色差；反查编号可抓到切片边界的重复或遗漏。 */
async function frameValues(file) {
  const { stdout } = await execute(path.resolve('apps/electron/bin/ffmpeg/ffmpeg.exe'), ['-v', 'error', '-i', file, '-an', '-vf', 'scale=1:1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { windowsHide: true, encoding: 'buffer' });
  return [...stdout];
}

async function main() {
  const queue = await (await call('/queue')).json();
  if (queue.queue_running.length || queue.queue_pending.length) { console.error('ComfyUI busy; skipped without interrupting tasks'); process.exitCode = 2; return; }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-workflow-slice-'));
  const source = path.join(directory, 'source.mp4');
  await execute(path.resolve('apps/electron/bin/ffmpeg/ffmpeg.exe'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=60', '-frames:v', '21', '-vf', "geq=lum='16+N*8':cb=128:cr=128", '-c:v', 'libx264', '-crf', '0', source], { windowsHide: true, timeout: 20000 });
  const tools = { ffmpegPath: path.resolve('apps/electron/bin/ffmpeg/ffmpeg.exe'), ffprobePath: path.resolve('apps/electron/bin/ffmpeg/ffprobe.exe') };
  const workflow = loadWorkflow();
  const name = await uploadSource(source), reference = await frameValues(source);
  for (const batchFrames of [10, 20]) {
    const prepared = await planVideo(tools, source, new AbortController().signal, batchFrames);
    assert.equal(new Set(reference).size, prepared.totalFrames);
    for (const [index, batch] of prepared.batches.entries()) await runBatch(workflow, name, batch, directory, index, reference, batchFrames);
    console.log('REAL_WORKFLOW_SLICES_OK', { directory, uploads: 1, batchFrames, frames: prepared.batches.map(batch => batch.frames), gpuInference: false });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
