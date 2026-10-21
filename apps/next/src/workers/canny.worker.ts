/** 在 Worker 中加载本地 OpenCV，解码、检测并编码 PNG；每次释放 Bitmap 与全部 WASM Mat。 */
type CannyRequest = import("../utils/canny-types").CannyRequest;
type CannyResponse = import("../utils/canny-types").CannyResponse;

type OpenCv = typeof import("@techstark/opencv-js");
interface LegacyRuntime { then?: (ready: (cv: OpenCv) => void) => void }
interface WorkerScope {
  cv: (OpenCv & LegacyRuntime) | Promise<OpenCv>;
  importScripts: (...urls: string[]) => void;
  postMessage: (message: CannyResponse) => void;
  onmessage: ((event: MessageEvent<CannyRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;
let runtime: Promise<{ cv: OpenCv }> | null = null;
function loadOpenCv(): Promise<{ cv: OpenCv }> {
  if (!runtime) {
    runtime = new Promise((resolve, reject) => {
      scope.importScripts(new URL("/vendor/opencv/opencv.js", self.location.href).href);
      const cvRuntime = scope.cv;
      // 旧式 Emscripten 的 then 回传自身，直接 resolve(module) 会无限同化；包一层对象隔断。
      const ready = (cv: OpenCv) => resolve({ cv });
      if (cvRuntime instanceof Promise) { void cvRuntime.then(ready).catch(reject); }
      else if (typeof cvRuntime.then === "function") cvRuntime.then(ready);
      else if (typeof cvRuntime.Mat === "function") ready(cvRuntime);
      else cvRuntime.onRuntimeInitialized = () => ready(cvRuntime);
    });
  }
  return runtime;
}

function detectEdges(cv: OpenCv, context: OffscreenCanvasRenderingContext2D, width: number, height: number, options: CannyRequest["options"]) {
  const mats: import("@techstark/opencv-js").Mat[] = [];
  try {
    const source = cv.matFromImageData(context.getImageData(0, 0, width, height)); mats.push(source);
    const gray = new cv.Mat(); mats.push(gray);
    const edges = new cv.Mat(); mats.push(edges);
    const rgba = new cv.Mat(); mats.push(rgba);
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.Canny(gray, edges, options.lower * 255, options.upper * 255, 3, true);
    if (options.inverted) cv.bitwise_not(edges, edges);
    cv.cvtColor(edges, rgba, cv.COLOR_GRAY2RGBA);
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), width, height), 0, 0);
  } finally { for (const mat of mats) mat.delete(); }
}

async function convert(request: CannyRequest): Promise<Blob> {
  const { cv } = await loadOpenCv(), bitmap = await createImageBitmap(request.file);
  try {
    const { width, height } = bitmap;
    if (width * height > request.maxPixels || Math.max(width, height) > request.maxSide) throw new Error("IMAGE_TOO_LARGE");
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    // 透明区域按白色底图检测，避免不可见 RGB 产生多余边缘。
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0);
    detectEdges(cv, context, width, height, request.options);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally { bitmap.close(); }
}

scope.onmessage = ({ data }) => {
  void convert(data).then(blob => scope.postMessage({ id: data.id, success: true, blob }))
    .catch(() => scope.postMessage({ id: data.id, success: false }));
};
