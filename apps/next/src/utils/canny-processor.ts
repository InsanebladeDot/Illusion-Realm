/** 管理一条 Canny Worker：按需启动、响应按编号匹配，超时释放线程；取消的旧结果不会覆盖新结果。 */
import type { CannyOptions, CannyRequest, CannyResponse } from "./canny-types";
import { CANNY_MAX_PIXELS, CANNY_MAX_SIDE } from "./canny-types";

interface PendingJob { id: number; resolve: (blob: Blob) => void; reject: (error: Error) => void; cleanup: () => void }

export function createCannyProcessor() {
  let worker: Worker | null = null, pending: PendingJob | null = null, sequence = 0;
  const settle = (error?: Error, blob?: Blob) => {
    const job = pending; pending = null;
    if (!job) return;
    job.cleanup();
    if (error) job.reject(error); else if (blob) job.resolve(blob);
  };
  const dispose = () => { worker?.terminate(); worker = null; settle(new DOMException("Aborted", "AbortError")); };
  const start = () => {
    if (worker) return worker;
    worker = new Worker("/workers/canny.js");
    worker.onmessage = ({ data }: MessageEvent<CannyResponse>) => {
      if (data.id !== pending?.id) return;
      if (data.success) settle(undefined, data.blob); else { settle(new Error("CANNY_FAILED")); dispose(); }
    };
    worker.onerror = event => { event.preventDefault(); settle(new Error("CANNY_WORKER_FAILED")); dispose(); };
    worker.onmessageerror = () => { settle(new Error("CANNY_RESPONSE_FAILED")); dispose(); };
    return worker;
  };
  const process = (file: File, options: CannyOptions, signal: AbortSignal) => new Promise<Blob>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    settle(new DOMException("Superseded", "AbortError"));
    const id = ++sequence, abort = () => { if (pending?.id === id) settle(new DOMException("Aborted", "AbortError")); };
    const timer = window.setTimeout(() => { settle(new Error("CANNY_TIMEOUT")); dispose(); }, 30000);
    pending = { id, resolve, reject, cleanup: () => { clearTimeout(timer); signal.removeEventListener("abort", abort); } };
    signal.addEventListener("abort", abort, { once: true });
    try { start().postMessage({ id, file, options, maxPixels: CANNY_MAX_PIXELS, maxSide: CANNY_MAX_SIDE } satisfies CannyRequest); }
    catch { settle(new Error("CANNY_START_FAILED")); dispose(); }
  });
  return { process, dispose };
}
