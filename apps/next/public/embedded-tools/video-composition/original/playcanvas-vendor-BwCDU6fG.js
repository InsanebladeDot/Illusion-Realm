// 隔离原主应用预加载；视频编码仍由原 src 模块在内存运行。
export const y = (load) => load();
export const v = () => ({});
