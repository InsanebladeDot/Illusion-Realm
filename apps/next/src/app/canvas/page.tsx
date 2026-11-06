// 无限画布使用现有满高外壳，导航仍属于 AppShell，不能复制到画布内部。
import { AppShell } from "@/components/AppShell";
import { InfiniteCanvasPage } from "@/view/infinite-canvas/infinite-canvas-page";

export default function Page() {
  return <AppShell fillViewport><InfiniteCanvasPage /></AppShell>;
}
