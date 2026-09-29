"use client";

import { useMemo, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import {
  ImagePreviewOverlay,
  type ImagePreviewItem,
} from "@/components/ImagePreviewOverlay";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { cn } from "@/utils/cn";

function imageName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

type ImageLoadState = "loading" | "ready" | "error";

function ImageStatus({ state }: { state: ImageLoadState }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      {state === "error" ? (
        <ImageOff className="h-6 w-6" />
      ) : (
        <Loader2 className="h-5 w-5 animate-spin" />
      )}
    </span>
  );
}

function LazyGeneratedImage({
  src,
  name,
  state,
  setState,
}: {
  src: string;
  name: string;
  state: ImageLoadState;
  setState: (state: ImageLoadState) => void;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
      className={cn(
        "relative h-full w-full object-contain transition-opacity duration-200",
        state === "ready" ? "opacity-100" : "opacity-0"
      )}
    />
  );
}

function ImageCaption({ name }: { name: string }) {
  return (
    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1.5 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {name}
    </span>
  );
}

function GeneratedImageCard({
  filePath,
  onOpen,
}: {
  filePath: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ImageLoadState>("loading");
  const src = buildLocalFileUrl(filePath);
  const name = imageName(filePath);

  return (
    <button
      type="button"
      disabled={state === "error"}
      onClick={onOpen}
      title={state === "error" ? t("agent.message.imageLoadFailed") : name}
      aria-label={t("agent.message.openGeneratedImage", { name })}
      className="group relative aspect-[3/4] w-full max-w-72 overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-muted-foreground disabled:cursor-default"
    >
      <ImageStatus state={state} />
      {src ? (
        <LazyGeneratedImage
          src={src}
          name={name}
          state={state}
          setState={setState}
        />
      ) : null}
      <ImageCaption name={name} />
    </button>
  );
}

function GeneratedImagePreview({
  items,
  index,
  setIndex,
}: {
  items: ImagePreviewItem[];
  index: number | null;
  setIndex: (index: number | null) => void;
}) {
  return (
    <ImagePreviewOverlay
      items={items}
      index={index ?? 0}
      onIndexChange={setIndex}
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) setIndex(null);
      }}
    />
  );
}

/** Agent 工具生成的图片：懒加载缩略图，点击后进入现有大图预览层。 */
export function AgentGeneratedImages({ images }: { images: string[] }) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const items: ImagePreviewItem[] = useMemo(
    () =>
      images.map((filePath) => ({
        key: filePath,
        src: buildLocalFileUrl(filePath),
        alt: imageName(filePath),
      })),
    [images]
  );

  if (images.length === 0) return null;
  return (
    <div
      data-agent-generated-images
      className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {images.map((filePath, index) => (
        <GeneratedImageCard
          key={filePath}
          filePath={filePath}
          onOpen={() => setPreviewIndex(index)}
        />
      ))}
      <GeneratedImagePreview
        items={items}
        index={previewIndex}
        setIndex={setPreviewIndex}
      />
    </div>
  );
}
