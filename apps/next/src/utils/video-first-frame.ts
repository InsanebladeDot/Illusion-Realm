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

export function videoFirstFrame(src: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (thumbnail?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      video.onloadeddata = null; video.onerror = null;
      video.removeAttribute("src"); video.load();
      resolve(thumbnail);
    };
    const timer = setTimeout(() => finish(), 8000);
    video.muted = true; video.playsInline = true; video.preload = "auto";
    video.onloadeddata = () => {
      try { finish(frameDataUrl(video)); } catch { finish(); }
    };
    video.onerror = () => finish();
    try { video.src = src; video.load(); } catch { finish(); }
  });
}
