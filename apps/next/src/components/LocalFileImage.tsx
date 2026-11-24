"use client";

import { useLocalImageSrc } from "@/hooks/useLocalImageSrc";
import { cn } from "@/utils/cn";
import { useState } from "react";

type LocalFileImageProps = {
  filePath: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function LocalFileImage({
  filePath,
  alt,
  className,
  fallback = null,
}: LocalFileImageProps) {
  const src = useLocalImageSrc(filePath);
  // 地址能够生成不代表文件仍在，文件被外部删除时必须显示缺图。
  // 记录失败的地址而非永久布尔值，换封面得到新地址后可以重新尝试。
  // 组件实例各自记录解码结果，不把一张坏图变成全局图片缓存失败。
  // 图片沿用原 alt 和 fallback，不向用户显示错误的成功占位图。
  // lazy 由浏览器判断可见范围，不会替代缓存限额或文件权限检查。
  // img 不在这里转 Canvas，透明度、动画和原分辨率仍由浏览器解码。
  const [failedSource, setFailedSource] = useState<string | null>(null);
  // 同路径覆盖后地址会改变，错误不会永久阻止修复后的封面展示。
  // 没有地址时保持 fallback，不创建指向空路径的 img。
  // 错误状态随组件释放，不保存到用户 JSON 或共享模型索引。
  // lazy 只延迟离屏读取，不改变卡片几何与可选择状态。

  if (!src || src === failedSource) return fallback;

  return <img src={src} alt={alt} loading="lazy" onError={() => setFailedSource(src)} className={cn(className)} />;
}
