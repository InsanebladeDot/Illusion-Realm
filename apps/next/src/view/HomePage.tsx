import { HomeHero } from "@/view/home/HomeHero";

export function HomePage() {
  /**
   * 首页只留概念页（用户要求「删掉画廊，保留图片和波浪的 SVG」）。
   * 画廊组件本身没删（`view/home/HomeGallery.tsx` 与其词条仍被引用），要还原就在下面加回一行。
   */
  return <HomeHero />;
}
