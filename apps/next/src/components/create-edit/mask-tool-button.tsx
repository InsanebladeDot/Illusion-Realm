"use client";

/** 蒙版工具按钮保留原选择动作，名称提示直接复用全站黑色小卡片。 */
import type { ReactNode } from 'react';
import { HoverTip } from '@/components/hover-tip';
import { cn } from '@/utils/cn';

interface Props { name: string; mode: string; selected: boolean; disabled: boolean; onClick: () => void; children: ReactNode }

export function MaskToolButton({ name, mode, selected, disabled, onClick, children }: Props) {
  return <HoverTip asChild label={name} placement="right">
    <button type="button" data-mask-mode={mode} aria-label={name} aria-pressed={selected} disabled={disabled} onClick={onClick}
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 [&>svg]:h-[18px] [&>svg]:w-[18px]', selected && 'bg-accent text-accent-text')}>
      {children}
    </button>
  </HoverTip>;
}
