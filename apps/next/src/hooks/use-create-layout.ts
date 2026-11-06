"use client";

/** 创建页按主区实际宽度分栏；侧栏开合、resize 与恢复可见都重新读取容器尺寸。 */
import { useEffect, useRef, useState } from "react";

export function useCreateLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<"single" | "two" | "three">("single");
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => {
      const width = element.getBoundingClientRect().width;
      // 主区被工具或图片详情替换时，后台工作区hidden会返回零宽。
      // 零宽不是单栏：切到single会卸载右栏及其中刚打开的图片详情。
      // 保留最后一次可见分栏，恢复工作区后ResizeObserver会重新读取真实宽度。
      // 隐藏期间的窗口缩放也不改变后台组件结构，避免丢失详情和选择现场。
      // 资源弹窗形态另读常驻父区域，不依赖这里保留的后台布局值。
      // 初始尚未布局同样跳过，待首个非零测量再应用760/1040断点。
      if (width <= 0) return;
      // 分栏只按主区可用宽度判断，导航缩窄或展开后仍使用同一组边界。
      // three 为表单、预览、文件管理；two 保留表单和文件管理，先让预览消失。
      // 低于 760px 才隐藏文件管理并显示侧边固钉，避免窗口断点提前挤出空白。
      setLayout(width >= 1040 ? "three" : width >= 760 ? "two" : "single");
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    window.addEventListener("resize", read);
    document.addEventListener("visibilitychange", read);
    return () => { observer.disconnect(); window.removeEventListener("resize", read); document.removeEventListener("visibilitychange", read); };
  }, []);
  return { ref, layout };
}
