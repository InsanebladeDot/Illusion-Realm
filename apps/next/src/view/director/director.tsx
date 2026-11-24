"use client";
import { HoverTip } from "@/components/hover-tip";


// 正式导演台只嵌入用户提供的原编译页面，React 不再生成三维工具栏或场景。
// iframe 隔离原 Vue、Three.js、样式和快捷键，宿主只管理工程与会话生命周期。
// 模型、姿势、IK 与动画继续使用原模块自身参数，不套用已删除重写版的默认值。
// 静态入口随 Next 导出与 app:// 一起分发，不增加本地服务或固定端口。
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "@/i18n";
import { DirectorBridge } from "./embed-bridge";
import type { DirectorCallbacks } from "./embed-events";
import type { DirectorSession } from "./director-session";
import { migrateScene } from "./migrate-scene";
import { playableDirectorScene } from "./director-media";
import { useDirectorNavigation } from "./use-director-navigation";

export interface DirectorProps extends DirectorCallbacks {
  sessionRef?: Ref<DirectorSession>;
  initialScene?: unknown;
}

export default function Director(props: DirectorProps) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<DirectorBridge | null>(null);
  const callbacks = useRef(props);
  const initial = useRef(props.initialScene);
  const alive = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useLayoutEffect(() => { callbacks.current = props; });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; bridge.current?.dispose(); bridge.current = null; };
  }, []);

  // 不把外层导航当成立即卸载；保存失败时导航停留，原组件能继续编辑与重试。
  // 关闭由专用桥接持有承诺，React 重新渲染不会产生第二次退出。
  // 迁移失败时 iframe 没有开始编辑，可退出错误态；原工程数据仍保留。
  function close(): Promise<void> {
    if (bridge.current) return bridge.current.close();
    callbacks.current.onCancel();
    return Promise.resolve();
  }
  useImperativeHandle(props.sessionRef, () => ({ close }));
  useDirectorNavigation(close);

  // onLoad 每次只给真实子窗口一条专线，重新加载会先销毁旧端口。
  // 初始化场景仅在本次挂载读取；切换场景节点由外层 key 建立新会话。
  // 迁移在副本上执行，失败不改原工程，也不回退到空场景覆盖用户作品。
  // opaque origin 仅影响 postMessage 的目标写法，收件人仍是这个确切 iframe。
  // 保存回调通过 ref 延迟读取，排队保存能看到上次写盘更新后的工程。
  // 消息解析异常在桥接内消费；资源加载前的错误在这里转为可见状态。
  function connect(): void {
    bridge.current?.dispose();
    const child = frame.current?.contentWindow;
    if (!child) return;
    try {
      const scene = initial.current == null ? null : playableDirectorScene(migrateScene(initial.current));
      const pair = new MessageChannel();
      bridge.current = new DirectorBridge(pair.port1, scene, () => callbacks.current, (value) => {
        if (alive.current) setState(value);
      });
      const origin = new URL(frame.current!.src).origin;
      child.postMessage({ protocol: "huanyu-original-director/v1" }, origin === "null" ? "*" : origin, [pair.port2]);
    } catch {
      setState("error");
    }
  }

  return <div data-director-root data-director-state={state} style={{ position: "relative", width: "100%", height: "100%", background: "var(--surface)" }}>
    {/* 导演台：原页面拥有内部控件；宿主不再叠加另一套模型、工具栏或属性面板。 */}
    <HoverTip asChild layer="window" label={(t("director.open")) ?? ""}><iframe ref={frame} data-original-director src="/director/original/embed.html" onLoad={connect} allow="fullscreen" style={{ display: "block", width: "100%", height: "100%", border: 0 }} /></HoverTip>
    {/* 会话状态：只反馈加载与持久化错误，实际内容和操作提示由原组件显示。 */}
    {state !== "ready" && <p role={state === "error" ? "alert" : "status"} style={{ position: "absolute", bottom: 8, left: 12, padding: 8, background: "var(--surface)", color: "var(--text-primary)", pointerEvents: "none" }}>{t(state === "error" ? "director.hostError" : "director.loading")}</p>}
  </div>;
}
