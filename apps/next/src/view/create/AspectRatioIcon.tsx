import { parseAspectRatio } from "@/utils/imageSize";

type AspectRatioIconProps = {
  /** 比例标签，如 "2:3" */
  ratio: string;
  className?: string;
};

const BOX = 18;

/**
 * 用内联 SVG 按比例画出矩形示意图（每个比例一个图标，无需额外素材）。
 * 宽度为 1 的边取整到 1px，保证 9:16 这类细长比例也能看清。
 */
export function AspectRatioIcon({ ratio, className }: AspectRatioIconProps) {
  const { w, h } = parseAspectRatio(ratio);
  const longest = Math.max(w, h);
  const rectWidth = Math.max(3, Math.round((w / longest) * BOX));
  const rectHeight = Math.max(3, Math.round((h / longest) * BOX));
  const x = (BOX - rectWidth) / 2;
  const y = (BOX - rectHeight) / 2;

  return (
    <svg
      width={BOX}
      height={BOX}
      viewBox={`0 0 ${BOX} ${BOX}`}
      aria-hidden
      className={className}
    >
      <rect
        x={x}
        y={y}
        width={rectWidth}
        height={rectHeight}
        rx={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
}
