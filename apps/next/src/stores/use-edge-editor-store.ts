"use client";

/**
 * 边缘编辑草稿跨路由保存源文件和参数，检测结果按当前参数重新计算。
 * URL 在显式替换或清除时释放，不随组件卸载释放。
 * 反转默认启用，只影响 Canny 黑白输出，不改变蒙版覆盖率。
 */
import { create } from 'zustand';
import type { CannySource } from '@/view/create/use-canny-preview';
import type { RangeInterval } from '@/components/range-interval-slider';

// 不保存 Worker 或未完成 Promise，这些执行资源由转换 hook 管理。
// File 只存在当前进程，不尝试把浏览器文件写入账户 JSON。
// source=null 表示不能生成，不能自动回退为普通文生图。
// enabled=false 保留源图与参数，只暂停转换，不清用户草稿。
// inverted 表示像素补值，UI 的 aria-pressed 只是该状态的显示。
// thresholds 是一对有序归一值，已有区间滑块负责限制交叉。
// 快速连续修改会产生新对象，使转换结果身份比较立即失效。
// 重进页面时重新转换，无法把旧 Worker 的半完成数据当成当前结果。
// 不保存 server 上传路径，下一次生成仍需重新提交当前 PNG。
// source 的 file 用于计算与读取元数据，url 只用于显示原图。
// 显式清除由 hook 释放 URL，再将 source 设为 null。
interface EdgeData { source: CannySource | null; enabled: boolean; inverted: boolean; thresholds: RangeInterval }
interface EdgeState extends EdgeData { patch: (value: Partial<EdgeData>) => void }
// 阈值保持旧功能默认值，唯一默认行为调整是启用反转。
// 面板默认启用检测，导入后即可看到转换，无需额外隐藏开关步骤。
// 参数对象原子替换，让转换 hook 能用身份校验过滤过期结果。
export const useEdgeEditorStore = create<EdgeState>(set => ({ source: null, enabled: true, inverted: true, thresholds: { lower: 0.1, upper: 0.3 }, patch: value => set(value) }));
