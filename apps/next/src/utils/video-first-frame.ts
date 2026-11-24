/** 在浏览器解码视频首帧，缩小为预览封面；原文件保持不变，超时或不支持的编码回退图标。 */
function frameDataUrl(video: HTMLVideoElement): string | undefined {
  if (!video.videoWidth || !video.videoHeight) return;
  const scale = Math.min(1, 192 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/** 允许列表在滚出视野或关闭后中止读取；不支持解码时返回空封面。 */
export function videoFirstFrame(src: string, signal?: AbortSignal): Promise<string | undefined> {
  if (signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (thumbnail?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      video.onloadeddata = null; video.onerror = null;
      video.removeAttribute("src"); video.load();
      resolve(thumbnail);
    };
    const abort = () => finish();
    const timer = setTimeout(() => finish(), 8000);
    signal?.addEventListener("abort", abort, { once: true });
    // 本地媒体协议按应用来源授权，启用匿名跨域读取后才能导出首帧小图。
    video.crossOrigin = "anonymous";
    video.muted = true; video.playsInline = true; video.preload = "auto";
    video.onloadeddata = () => {
      try { finish(frameDataUrl(video)); } catch { finish(); }
    };
    video.onerror = () => finish();
    try { video.src = src; video.load(); } catch { finish(); }
  });
}
