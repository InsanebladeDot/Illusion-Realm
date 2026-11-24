"use client";

// 应用导航仍由 AppShell 管理，但离开导演台之前先等待宿主保存。
// 不拦截右键、新窗口或外部链接；这里只保护当前窗口里的正常页面切换。
// 保存拒绝时不继续导航，用户仍能看见并重试当前作品。
import { useEffect, useRef, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
export function useDirectorNavigation(close: () => Promise<void>) {
  const router = useRouter(),
    latest = useRef(close);
  useLayoutEffect(() => {
    latest.current = close;
  }, [close]);
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      const href = navigationTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void latest
        .current()
        .then(() => router.push(href))
        .catch(() => {});
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [router]);
}

function navigationTarget(event: MouseEvent): string | null {
  if (
    event.button ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a[href]")
      : null;
  if (!link || link.closest("[data-director-root]") || link.target === "_blank")
    return null;
  const href = link.getAttribute("href");
  if (!href?.startsWith("/") || href.startsWith("//")) return null;
  return href;
}
