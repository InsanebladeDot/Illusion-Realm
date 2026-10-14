"use client";

// 图片与视频共用完整参数行；调用方只传标签、范围、数值和更新逻辑。
import { useId } from "react";
import { Info } from "lucide-react";
import { RangeSlider } from "./RangeSlider";
import { ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

interface GenerationParameterControlProps {
  name: string;
  label: string;
  hint?: string;
  inputAriaLabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  inputStep?: number | "any";
  precision?: number;
  onChange: (value: number) => void;
}

function ParameterLabel({ id, label, hint }: { id: string; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {hint && <button type="button" className="focus:outline-none" aria-label={hint} title={hint}>
        <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
      </button>}
    </div>
  );
}

function ParameterInput({ id, ...props }: GenerationParameterControlProps & { id: string }) {
  const { name, label, inputAriaLabel, value, min, max, step, inputStep, precision, onChange } = props;
  return (
    <input id={id} name={name} type="number" min={min} max={max} step={inputStep ?? step}
      aria-label={inputAriaLabel ?? label} value={precision === undefined ? value : value.toFixed(precision)}
      onChange={(event) => {
        const number = event.target.valueAsNumber;
        if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number)));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      }}
      className={cn(
        "h-8 w-16 shrink-0 rounded-md bg-background text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1",
        ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS
      )}
    />
  );
}

export function GenerationParameterControl(props: GenerationParameterControlProps) {
  const id = useId();
  const { name, label, hint, value, min, max, step, onChange } = props;
  return (
    <div className="space-y-1" data-generation-parameter={name}>
      <ParameterLabel id={id} label={label} hint={hint} />
      <div className="flex min-w-0 items-center gap-2">
        <RangeSlider min={min} max={max} step={step} value={value} onChange={onChange} />
        <ParameterInput {...props} id={id} />
      </div>
    </div>
  );
}
