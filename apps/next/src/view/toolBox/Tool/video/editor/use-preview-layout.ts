"use client";

// 节目只占实际项目相框所需宽度，像把相框外多余的垫纸归还素材书架。
// 上区高由原分隔条控制，读真实高度计算宽度，不重写项目像素或视频变换。
// 仅正式宿主接入，静态样板仍沿用原布局，窄窗继续使用原紧凑面板机制。
import { useLayoutEffect, type RefObject } from "react";

// 预览标题40、控制64、底部8及左右24来自当前共享预览的固定槽位。
// 这几项扣除后剩下的高度才是黑色项目相框，不把按钮高度当视频高度。
// 实际轨道与节目帧不受宽度变化影响，ClipCanvas继续按项目百分比投影。
// 给素材至少280px，属性按原语义宽度占位，剩余宽度允许预览收缩。
// 导航开合与分隔调整都会触发同一ResizeObserver，不能只监听窗口resize。
// observer直接更新局部CSS变量，不在每个resize向工程状态写一份宽高。
// 清理恢复变量并断开观察，返回页面的新实例不继承旧尺寸。
// CSS的响应式列数仍决定是否显示素材/属性，这里只提供桌面预览宽度预算。
export function usePreviewLayout(ref: RefObject<HTMLDivElement | null>, enabled: boolean, ratio: number) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      const inspector = element.querySelector<HTMLElement>('[data-editor-region="R04"]');
      const inspectorWidth = inspector?.getBoundingClientRect().width ?? 0;
      const available = width - inspectorWidth - 280;
      element.style.setProperty("--program-width", `${Math.max(240, Math.min((height - 112) * ratio + 24, available))}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element); update();
    return () => { observer.disconnect(); element.style.removeProperty("--program-width"); };
  }, [ref, enabled, ratio]);
}
