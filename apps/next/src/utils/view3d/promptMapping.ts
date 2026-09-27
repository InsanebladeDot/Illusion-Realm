/**
 * 3D 视角 → AI 提示词动态生成（严格按《AI 提示词动态生成 — 完整需求文档》实现）
 *
 * 相机三个参数各控制一个维度：
 * | 相机参数 | 维度 | 映射 |
 * |---|---|---|
 * | 半径 r | Z 轴距离 | 景别（特写 → 远景），互斥只输出 1 个 |
 * | 方位角 azimuth | X 轴水平旋转 | 朝向（正面 → 侧面 → 背面），权重最高 1~2 个 |
 * | 俯仰角 elevation | Y 轴垂直俯仰 | 视角（俯视 → 平视 → 仰视） |
 *
 * 输出：`[景别] + [朝向] + [视角]`，权重为 1.0 的词条不带括号（例如 `full body`），
 * 权重 > 1 的词条写成 `(front view:2.0)`。
 *
 * 本模块是纯函数，不依赖 three.js / React，便于单测与复用。
 */

import {
  SERIES_ENHANCE_MAX,
  clampEnhanceWeights,
  type EnhanceWeights,
} from "@/utils/view3d/enhanceWeights";

export type ViewSeries = "anima" | "sdxl";

export type SphericalView = {
  /** 方位角，单位度，取值 [0, 360)；换算成 signed 后 > 0 表示相机向右偏移（看到左脸） */
  azimuth: number;
  /** 俯仰角，单位度，取值 [-90, 90]，+ 为俯视、- 为仰视 */
  elevation: number;
  /** 相机到原点距离（Z 轴） */
  radius: number;
};

/** 带权重词条 */
export type WeightedTag = { tag: string; weight: number };

// ---------------------------------------------------------------------------
// Z 轴：半径 → 景别（互斥，同一时刻只输出 1 个；权重固定 1.0）
// ---------------------------------------------------------------------------

const SHOT_BUCKETS: { max: number; tag: string }[] = [
  { max: 1.5, tag: "extreme close-up" },
  { max: 3, tag: "close-up" },
  { max: 4, tag: "medium shot" },
  { max: 5, tag: "cowboy shot" },
  { max: 6.5, tag: "full body" },
  { max: Number.POSITIVE_INFINITY, tag: "wide shot, scenery" },
];

/** 景别词条（权重 1.0，直接输出不带括号） */
export function mapShot(radius: number): string {
  const matched = SHOT_BUCKETS.find((bucket) => radius < bucket.max);
  return (matched ?? SHOT_BUCKETS[SHOT_BUCKETS.length - 1]).tag;
}

/** 每个系列的默认相机距离（文档示例：Anima R=5 / SDXL R=8） */
export const SERIES_DEFAULT_RADIUS: Record<ViewSeries, number> = {
  anima: 5,
  sdxl: 8,
};

/** 半径可调范围（覆盖 extreme close-up ~ wide shot 全部档位） */
export const RADIUS_MIN = 0.5;
export const RADIUS_MAX = 12;

// ---------------------------------------------------------------------------
// X 轴：方位角 → 朝向
// ---------------------------------------------------------------------------

/** 把方位角规范到 [0, 360) */
export function normalizeAzimuth(azimuth: number): number {
  const value = azimuth % 360;
  return value < 0 ? value + 360 : value;
}

/** 规范到 (-180, 180]：> 0 = 相机向右偏移（看到角色左脸），< 0 = 向左偏移（看到右脸） */
export function signedAzimuth(azimuthDeg: number): number {
  const azimuth = normalizeAzimuth(azimuthDeg);
  return azimuth > 180 ? azimuth - 360 : azimuth;
}

/**
 * 朝向权重随俯仰角的衰减系数：
 * 平视 1.0 → 45° 时 2/3 → 90° 时 0。
 * 依据文档第二节/第五节的示例（斜俯视 `(front view:2.0)`、垂直俯视不输出朝向）：
 * 相机到正上方/正下方时水平朝向已经没有意义，因此系数归零。
 */
export function horizontalFactor(elevationDeg: number): number {
  const angle = Math.min(Math.abs(elevationDeg), 90);
  if (angle <= 45) return 1 - (angle / 45) * (1 / 3);
  return (2 / 3) * (1 - (angle - 45) / 45);
}

/**
 * X 轴：方位角 → 朝向词条（含过渡区间渐变）
 * - |az| < 30：`front view` 3.0（锁定正面，无辅助词条）
 * - 30 ≤ |az| < 60：`front view` 3.0→2.0 与 `facing left/right` 1.0→3.0 共存
 * - 60 ≤ |az| < 120：`facing left/right` 3.0（文档：|az| ≥ 60 时 front 消失）
 * - 120 ≤ |az| < 150：`from behind` 2.0→3.0 与 `facing left/right` 3.0→1.0 共存
 * - |az| ≥ 150：`from behind` 3.0（facing 消失）
 *
 * 区间边界取「左闭右开」，保证任意角度只有一个分支生效、且与文档里的渐变公式在接缝处连续。
 */
export function mapAzimuthTags(azimuthDeg: number, elevationDeg = 0): WeightedTag[] {
  const signed = signedAzimuth(azimuthDeg);
  const angle = Math.abs(signed);
  const facingTag = signed >= 0 ? "facing left" : "facing right";
  const raw: WeightedTag[] = [];

  if (angle < 30) {
    raw.push({ tag: "front view", weight: 3 });
  } else if (angle < 60) {
    // 越接近 30° 越接近 3.0；越接近 60° facing 越高
    raw.push({ tag: "front view", weight: 2 + ((60 - angle) / 30) * 1 });
    raw.push({ tag: facingTag, weight: 1 + ((angle - 30) / 30) * 2 });
  } else if (angle < 120) {
    raw.push({ tag: facingTag, weight: 3 });
  } else if (angle < 150) {
    raw.push({ tag: "from behind", weight: 2 + ((angle - 120) / 30) * 1 });
    raw.push({ tag: facingTag, weight: 3 - ((angle - 120) / 30) * 2 });
  } else {
    raw.push({ tag: "from behind", weight: 3 });
  }

  const factor = horizontalFactor(elevationDeg);
  return raw.map((item) => ({ tag: item.tag, weight: item.weight * factor }));
}

// ---------------------------------------------------------------------------
// Y 轴：俯仰角 → 视角
// ---------------------------------------------------------------------------

/**
 * Y 轴：俯仰角 → 视角词条
 * - |el| ≤ 20：平视，不输出
 * - 20 ~ 45：1.5 → 2.0
 * - 45 ~ 90：2.0 → 3.0
 */
export function mapElevationTags(elevationDeg: number): WeightedTag[] {
  const elevation = Math.max(-90, Math.min(90, elevationDeg));
  const angle = Math.abs(elevation);
  if (angle <= 20) return [];

  const weight =
    angle <= 45
      ? 1.5 + ((angle - 20) / 25) * 0.5
      : 2 + ((angle - 45) / 45) * 1;

  return [{ tag: elevation >= 0 ? "high angle" : "low angle", weight }];
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

export type ViewPromptParts = {
  /** Z 轴：景别词条（基准权重 1.0） */
  shot: string;
  /** Z 轴：景别（带倍率后的形式，倍率 1 时权重就是 1.0） */
  shotTag: WeightedTag;
  /** X 轴：朝向词条（最多 2 个） */
  toward: WeightedTag[];
  /** Y 轴：视角词条（最多 1 个，平视时为空） */
  angle: WeightedTag[];
  /** 拼好的提示词：景别 + 朝向 + 视角 */
  full: string;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 词条格式化：权重 1.0 直接输出词条（例如 `full body`），
 * 权重 > 1 输出带权形式（例如 `(front view:2.0)`）。
 */
export function formatWeightedTag(item: WeightedTag): string {
  const weight = round1(item.weight);
  return weight > 1 ? `(${item.tag}:${weight.toFixed(1)})` : item.tag;
}

/**
 * 应用增强倍率（可选）：
 * - 文档给出的权重是“基准值”，四个滑块默认全为 1 时结果与文档完全一致；
 * - 倍率放大后按系列权重上限收敛（Anima 3.0 / SDXL 2.0，见文档第七节）；
 * - 最终权重不足 1.0 的词条不输出（平视不出视角、极端俯仰下朝向无意义等）。
 */
function applyMultiplier(
  items: WeightedTag[],
  multiplier: number,
  total: number,
  cap: number
): WeightedTag[] {
  return items
    .map((item) => ({
      tag: item.tag,
      weight: round1(Math.min(item.weight * multiplier * total, cap)),
    }))
    .filter((item) => item.weight >= 1);
}

/** 把相机参数换算成提示词各部分 */
export function mapViewToPromptParts(
  view: SphericalView,
  series: ViewSeries,
  weights?: Partial<EnhanceWeights> | null
): ViewPromptParts {
  const values = clampEnhanceWeights(weights, series);
  const cap = SERIES_ENHANCE_MAX[series] ?? SERIES_ENHANCE_MAX.anima;

  const shot = mapShot(view.radius);
  const toward = applyMultiplier(
    mapAzimuthTags(view.azimuth, view.elevation),
    values.x,
    values.total,
    cap
  );
  const angle = applyMultiplier(
    mapElevationTags(view.elevation),
    values.y,
    values.total,
    cap
  );
  // 景别基准权重固定 1.0：倍率为 1 时就是裸词条，放大后才写成 (full body:·)
  const shotTagList = applyMultiplier(
    [{ tag: shot, weight: 1 }],
    values.z,
    values.total,
    cap
  );
  const shotTag = shotTagList[0] ?? { tag: shot, weight: 1 };

  const full = [
    formatWeightedTag(shotTag),
    ...toward.map(formatWeightedTag),
    ...angle.map(formatWeightedTag),
  ].join(", ");

  return { shot, shotTag, toward, angle, full: full || shot };
}

/** 便捷方法：直接得到拼接好的提示词 */
export function buildViewPrompt(
  view: SphericalView,
  series: ViewSeries,
  weights?: Partial<EnhanceWeights> | null
): string {
  return mapViewToPromptParts(view, series, weights).full;
}

// ---------------------------------------------------------------------------
// 附加词条（可选）：基础词表是「相机行为词」，这里补的是「观察方位词」
// ---------------------------------------------------------------------------

/**
 * 当前角度**建议**补充的观察方位词（不自动写入）。
 *
 * 为什么是"建议"而不是直接改映射：基础词表由需求文档锁定
 * （`front view` / `facing left|right` / `from behind` + `high angle` / `low angle`），
 * 而 `from side` / `from above` / `from below` 属于另一类词（观察方位 vs 相机行为）——
 * 它们对模型是否更有用是**经验问题**，同 seed 跑两组对比比改映射安全得多。
 *
 * 参数判据与 `mapAzimuthTags` / `mapElevationTags` **同源**，保证建议与输出不打架：
 * - 侧向（60° ≤ |方位角| < 120°，该区间只输出 `facing left/right`）→ `from side`
 * - 俯视（俯仰角 ≥ 20°，该区间只输出 `high angle`）→ `from above`
 * - 仰视（俯仰角 ≤ -20°，该区间只输出 `low angle`）→ `from below`
 * - 正面 / 背面区间不重复建议（`front view` / `from behind` 已在基础词条里）
 */
export function suggestExtraTags(view: SphericalView): string[] {
  const angle = Math.abs(signedAzimuth(view.azimuth));
  const elevation = Math.max(-90, Math.min(90, view.elevation));
  const tags: string[] = [];
  if (angle >= 60 && angle < 120) tags.push("from side");
  if (elevation >= 20) tags.push("from above");
  else if (elevation <= -20) tags.push("from below");
  return tags;
}

/**
 * 把附加词条拼到基础提示词之后。
 * 附加为空（或只有逗号/空白）时**逐字**返回基础串 —— 这正是"默认行为不变"的支点。
 */
export function composeViewPrompt(base: string, extra: string): string {
  const trimmed = extra.trim().replace(/^[,、\s]+/, "").replace(/[,、\s]+$/, "");
  return trimmed ? `${base}, ${trimmed}` : base;
}
