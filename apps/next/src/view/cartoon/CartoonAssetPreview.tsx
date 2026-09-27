"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { CartoonBubbleAsset } from "@/types/cartoonBubble";

type CartoonAssetPreviewProps = {
  asset: CartoonBubbleAsset;
};

export function CartoonAssetPreview({ asset }: CartoonAssetPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  /** 素材原始尺寸：初值来自 asset，图片 onLoad 后会被真实像素尺寸覆盖，因此必须是 state */
  const [naturalSize, setNaturalSize] = useState({
    width: asset.width,
    height: asset.height,
  });

  /**
   * 渲染期同步：切换到另一个素材时把原始尺寸重置为新素材的声明值
   * （随后 onLoad 再用真实像素尺寸覆盖）。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setState，语义等价且少一次级联渲染。
   */
  const [previousAssetKey, setPreviousAssetKey] = useState<string | null>(null);
  const assetKey = `${asset.id}|${asset.width}|${asset.height}`;
  if (assetKey !== previousAssetKey) {
    setPreviousAssetKey(assetKey);
    setNaturalSize({ width: asset.width, height: asset.height });
  }

  const updateDisplaySize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const ratio = naturalSize.width / naturalSize.height;
    let width = rect.width;
    let height = width / ratio;
    if (height > rect.height) {
      height = rect.height;
      width = height * ratio;
    }
    setDisplaySize({ width, height });
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    updateDisplaySize();
    const observer = new ResizeObserver(updateDisplaySize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
    >
      <div
        className="relative shrink-0 select-none"
        style={{ width: displaySize.width, height: displaySize.height }}
      >
        <Image
          src={asset.src}
          alt={asset.name}
          fill
          unoptimized
          className="pointer-events-none object-contain"
          sizes="(max-width: 768px) 100vw, 50vw"
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setNaturalSize({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }
          }}
        />
      </div>
    </div>
  );
}
