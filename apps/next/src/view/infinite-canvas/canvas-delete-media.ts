/** 删除前释放本工作区的音视频源；失败时恢复地址但不自动续播，避免占用文件或突然出声。 */
import { canvasLibrary } from "./canvas-library-api";

export async function deleteCanvasSession(projectId: string, host: HTMLElement | null) {
  const sources = Array.from(host?.querySelectorAll<HTMLMediaElement>("video,audio") ?? [])
    .map(media => ({ media, src: media.getAttribute("src") }));
  for (const { media } of sources) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
  try { await canvasLibrary({ operation: "remove", ids: [projectId] }); }
  catch (error) {
    for (const { media, src } of sources) {
      if (src !== null) media.setAttribute("src", src);
      media.load();
    }
    throw error;
  }
}
