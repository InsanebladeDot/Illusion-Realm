/** Shared preset geometry: page coordinates become local polygon vertices for preview and editing. */
import type { MessageKey } from "@/i18n";

export interface ComicPoint { x: number; y: number }
export interface ComicFrame { x: number; y: number; width: number; height: number; vertices: ComicPoint[] }
export type ComicCategory = "regular" | "dialogue" | "action" | "polygon" | "torn";
export interface ComicTemplate { id: string; category: string; nameKey?: MessageKey; name?: string; frames: ComicFrame[]; pageSize?: { width: number; height: number }; backgroundColor?: string }
export const COMIC_CATEGORIES: ComicCategory[] = ["regular", "dialogue", "action", "polygon", "torn"];

function polygon(coords: number[][]): ComicFrame {
  const xs = coords.map(point => point[0]), ys = coords.map(point => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  return { x, y, width, height, vertices: coords.map(([px, py]) => ({ x: (px - x) / width * 100, y: (py - y) / height * 100 })) };
}
function rect(x: number, y: number, width: number, height: number): ComicFrame {
  return polygon([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
}
function grid(columns: number, rows: number): ComicFrame[] {
  const width = (92 - (columns - 1) * 2) / columns, height = (94 - (rows - 1) * 2) / rows;
  return Array.from({ length: columns * rows }, (_, i) => rect(4 + (i % columns) * (width + 2), 3 + Math.floor(i / columns) * (height + 2), width, height));
}
function tear(frame: ComicFrame, seed: number): ComicFrame {
  const points: ComicPoint[] = [];
  let value = seed;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  frame.vertices.forEach((start, edge) => {
    const end = frame.vertices[(edge + 1) % frame.vertices.length];
    points.push({ ...start });
    for (let step = 1; step < 12; step++) {
      const ratio = (step + random() * 0.65 - 0.325) / 12, depth = 0.6 + random() * 8;
      const px = start.x + (end.x - start.x) * ratio, py = start.y + (end.y - start.y) * ratio;
      const inward = depth / 100;
      points.push({ x: px + (50 - px) * inward, y: py + (50 - py) * inward });
    }
  });
  return { ...frame, vertices: points };
}
function preset(id: string, category: ComicCategory, nameKey: MessageKey, frames: ComicFrame[]): ComicTemplate {
  return { id, category, nameKey, frames };
}

const mixed = [rect(4, 3, 92, 38), rect(4, 43, 28, 24), rect(34, 43, 28, 24), rect(64, 43, 32, 54), rect(4, 69, 58, 28)];
const slanted = [
  polygon([[4, 3], [48, 3], [43, 27], [4, 22]]), polygon([[50, 3], [96, 3], [96, 34], [45, 27]]),
  polygon([[4, 24], [96, 36], [96, 69], [4, 74]]),
  polygon([[4, 76], [43, 74], [49, 97], [4, 97]]), polygon([[45, 74], [96, 71], [96, 97], [51, 97]]),
];
const shards = [
  polygon([[4, 3], [61, 3], [43, 33], [4, 28]]), polygon([[64, 3], [96, 3], [96, 43], [46, 34]]),
  polygon([[4, 31], [42, 36], [58, 62], [4, 69]]), polygon([[46, 37], [96, 46], [96, 70], [61, 63]]),
  polygon([[4, 72], [58, 65], [96, 73], [96, 97], [4, 97]]),
];
const diagonal = polygon([[7, 32], [94, 16], [88, 66], [4, 81]]);

export const COMIC_TEMPLATES: ComicTemplate[] = [
  preset("regular-4", "regular", "toolBox.comic.templates.names.fourGrid", grid(2, 2)),
  preset("regular-6", "regular", "toolBox.comic.templates.names.sixGrid", grid(2, 3)),
  preset("regular-9", "regular", "toolBox.comic.templates.names.nineGrid", grid(3, 3)),
  preset("regular-strips", "regular", "toolBox.comic.templates.names.fourStrips", grid(1, 4)),
  preset("regular-columns", "regular", "toolBox.comic.templates.names.threeColumns", grid(3, 1)),
  preset("dialogue-mixed", "dialogue", "toolBox.comic.templates.names.mixed", mixed),
  preset("dialogue-opener", "dialogue", "toolBox.comic.templates.names.opener", [rect(4, 3, 92, 46), rect(4, 51, 45, 22), rect(51, 51, 45, 22), rect(4, 75, 92, 22)]),
  preset("dialogue-reaction", "dialogue", "toolBox.comic.templates.names.reactions", [rect(4, 3, 92, 28), rect(4, 33, 29, 28), rect(35, 33, 30, 28), rect(67, 33, 29, 28), rect(4, 63, 92, 34)]),
  preset("dialogue-tall", "dialogue", "toolBox.comic.templates.names.tall", [rect(4, 3, 34, 94), rect(40, 3, 56, 30), rect(40, 35, 56, 30), rect(40, 67, 56, 30)]),
  preset("dialogue-alternate", "dialogue", "toolBox.comic.templates.names.alternate", [rect(4, 3, 60, 30), rect(66, 3, 30, 30), rect(4, 35, 30, 30), rect(36, 35, 60, 30), rect(4, 67, 60, 30), rect(66, 67, 30, 30)]),
  preset("action-slant", "action", "toolBox.comic.templates.names.slant", slanted),
  preset("action-cut", "action", "toolBox.comic.templates.names.doubleCut", [polygon([[4, 3], [96, 3], [96, 24], [4, 42]]), polygon([[4, 45], [96, 27], [96, 64], [4, 78]]), polygon([[4, 81], [96, 67], [96, 97], [4, 97]])]),
  preset("action-burst", "action", "toolBox.comic.templates.names.burst", [polygon([[4, 3], [49, 43], [4, 61]]), polygon([[7, 3], [96, 3], [52, 42]]), polygon([[96, 6], [96, 94], [55, 46]]), polygon([[4, 64], [49, 48], [93, 97], [4, 97]])]),
  preset("action-impact", "action", "toolBox.comic.templates.names.impact", [rect(4, 3, 29, 22), rect(35, 3, 30, 22), rect(67, 3, 29, 22), polygon([[4, 27], [96, 27], [96, 97], [4, 86]])]),
  preset("action-inset", "action", "toolBox.comic.templates.names.inset", [rect(4, 3, 92, 94), polygon([[58, 6], [93, 6], [93, 36], [53, 29]]), polygon([[7, 67], [48, 76], [41, 94], [7, 94]])]),
  preset("polygon-shards", "polygon", "toolBox.comic.templates.names.shards", shards),
  preset("polygon-pentagon", "polygon", "toolBox.comic.templates.names.pentagons", [polygon([[4, 3], [94, 3], [96, 26], [52, 40], [4, 29]]), polygon([[4, 32], [49, 43], [45, 68], [21, 74], [4, 60]]), polygon([[52, 43], [96, 29], [96, 67], [75, 78], [48, 69]]), polygon([[4, 77], [45, 72], [75, 81], [96, 70], [96, 97], [4, 97]])]),
  preset("polygon-zigzag", "polygon", "toolBox.comic.templates.names.zigzag", [polygon([[4, 3], [96, 3], [96, 24], [54, 34], [34, 26], [4, 39]]), polygon([[4, 42], [34, 29], [54, 37], [96, 27], [96, 67], [60, 57], [30, 71], [4, 60]]), polygon([[4, 63], [30, 74], [60, 60], [96, 70], [96, 97], [4, 97]])]),
  preset("polygon-hexagon", "polygon", "toolBox.comic.templates.names.hexagon", [rect(4, 3, 45, 28), rect(51, 3, 45, 28), rect(4, 69, 45, 28), rect(51, 69, 45, 28), polygon([[25, 24], [75, 24], [96, 50], [75, 76], [25, 76], [4, 50]])]),
  preset("polygon-offset", "polygon", "toolBox.comic.templates.names.offset", [polygon([[4, 3], [67, 3], [58, 37], [4, 29]]), polygon([[70, 3], [96, 3], [96, 64], [63, 51]]), polygon([[4, 32], [57, 40], [60, 67], [4, 80]]), polygon([[4, 83], [62, 70], [96, 67], [96, 97], [4, 97]])]),
  preset("torn-strips", "torn", "toolBox.comic.templates.names.tornStrips", grid(1, 3).map((frame, i) => tear(frame, 11 + i))),
  preset("torn-diagonal", "torn", "toolBox.comic.templates.names.tornDiagonal", [...grid(1, 3), tear(diagonal, 38)]),
  preset("torn-shards", "torn", "toolBox.comic.templates.names.tornShards", shards.map((frame, i) => tear(frame, 79 + i))),
  preset("torn-inset", "torn", "toolBox.comic.templates.names.tornInset", [rect(4, 3, 92, 94), tear(polygon([[8, 12], [65, 7], [71, 46], [13, 55]]), 17), tear(polygon([[34, 52], [93, 46], [88, 93], [28, 86]]), 89)]),
  preset("torn-slant", "torn", "toolBox.comic.templates.names.tornSlant", slanted.map((frame, i) => tear(frame, 131 + i))),
];
