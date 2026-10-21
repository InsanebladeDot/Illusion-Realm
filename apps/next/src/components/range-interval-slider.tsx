"use client";

// 纯 UI：两个原生滑块共用一条轨道，负责归一化区间输入，不包含检测或网络逻辑。
export interface RangeInterval { lower: number; upper: number }
interface RangeIntervalSliderProps {
  value: RangeInterval;
  onChange: (value: RangeInterval) => void;
  lowerLabel: string;
  upperLabel: string;
}

const INPUT = "pointer-events-none absolute inset-x-0 top-0 h-7 w-full appearance-none bg-transparent outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-fill [&::-webkit-slider-thumb]:bg-background focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-accent-stroke focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-accent-fill [&::-moz-range-thumb]:bg-background";

export function RangeIntervalSlider({ value, onChange, lowerLabel, upperLabel }: RangeIntervalSliderProps) {
  return <div dir="ltr" data-range-interval className="relative h-7 w-full min-w-0">
    <div aria-hidden className="pointer-events-none absolute inset-x-2 top-3 h-1 rounded-full bg-muted">
      <div className="absolute h-full rounded-full bg-accent-fill" style={{ left: `${value.lower * 100}%`, right: `${(1 - value.upper) * 100}%` }} />
    </div>
    <input type="range" data-interval-lower min={0} max={1} step={0.01} value={value.lower} aria-label={lowerLabel} aria-valuemax={value.upper}
      onChange={event => onChange({ ...value, lower: Math.min(Number(event.target.value), value.upper) })}
      className={INPUT} style={{ zIndex: value.lower === 1 ? 2 : 1 }} />
    <input type="range" data-interval-upper min={0} max={1} step={0.01} value={value.upper} aria-label={upperLabel} aria-valuemin={value.lower}
      onChange={event => onChange({ ...value, upper: Math.max(Number(event.target.value), value.lower) })}
      className={INPUT} />
  </div>;
}
