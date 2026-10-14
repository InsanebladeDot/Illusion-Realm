/** Raster previews use the same frame geometry as the editor, including overlap order and tear vertices. */
import type { ComicTemplate } from "@/data/comic-templates";
import { readBackgroundColor } from "./custom-templates";

const thumbnailCache = new Map<string, string>();
export function templateThumbnail(template: ComicTemplate): string {
  const cached = thumbnailCache.get(template.id);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const aspect = template.pageSize ? template.pageSize.height / template.pageSize.width : 4 / 3;
  canvas.width = 240; canvas.height = Math.max(1, Math.round(240 * aspect));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = readBackgroundColor(template.backgroundColor); ctx.fillRect(0, 0, canvas.width, canvas.height);
  template.frames.forEach((frame, index) => {
    ctx.beginPath();
    frame.vertices.forEach((point, i) => {
      const x = (frame.x + point.x * frame.width / 100) * 2.4;
      const y = (frame.y + point.y * frame.height / 100) * canvas.height / 100;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fillStyle = ["#e8edef", "#f2e9e7", "#e7efea"][index % 3];
    ctx.fill(); ctx.strokeStyle = "#424d54"; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.fillStyle = "#57646c"; ctx.font = "14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), (frame.x + frame.width / 2) * 2.4, (frame.y + frame.height / 2) * canvas.height / 100); ctx.restore();
  });
  const result = canvas.toDataURL("image/png"); thumbnailCache.set(template.id, result);
  return result;
}
