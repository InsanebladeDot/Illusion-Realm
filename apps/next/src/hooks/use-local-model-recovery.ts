"use client";
/**
 * 管理手动模型补全的页面状态，具体流式读取和网络事务均在主进程。
 * 结果按版本路径隔离；切换版本不会把上一个文件的成功提示带过去。
 * 来源刷新与封面扫描分开处理，封面刷新失败不篡改已落盘的补全结果。
 */
import { useRef, useState } from "react";
// 只引入返回类型，主进程文件和 Node API 不进入 renderer bundle。
import type { LocalModelRecoveryResult } from "@illusion-realm/shared";
import { recoverLocalModelMetadata } from "@/utils/electronBridge";
import { useSettingsStore } from "@/stores/useSettingsStore";
// 批量与单个补全共享同一主进程入口，页面内不要让两种操作重复读同一文件。
// store 只用于能力互斥与进度订阅，单文件详情仍有自己按版本隔离的提示。
// 切页后运行中的批量任务仍会让单个按钮保持禁用。
import { useModelRecoveryBatchStore } from "@/stores/use-model-recovery-batch-store";
// 局部交互状态不会写到全局用户数据文档；来源 JSON 本身才是持久化结果。
// 重新进入页面时原有读取 hook 会加载 sidecar，不依赖这里的内存提示。
// 扫描只在实际保存封面后触发，减少对整个模型目录的重复枚举。
/**
 * 一个详情面板最多发出一个请求，Ref 在 React 提交前就阻挡重复点击。
 * busy 覆盖版本切换期间，避免用户误以为旧任务停止而再次启动。
 * 主进程仍有跨窗口并发限制，不能只依赖页面按钮禁用。
 * revision 在成功或 existing 后递增，以重新读取真实 sidecar。
 * 卸载不撤销已经开始的事务，重新进入会从磁盘看到结果。
 * UI 不显示原始异常文本，故不会泄漏系统路径或服务错误正文。
 * @param filePath 当前用户选中的具体模型文件。
 */
export function useLocalModelRecovery(filePath: string) {
  // 跨页面的批量状态独立于本 hook，组件卸载不会重置它。
  // 详情按钮等待批量返回后再允许发起新的读取，避免无意义的 busy 失败。
  // 主进程仍执行自己的目录锁，不依赖这一客户端禁用作为安全边界。
  const batchRunning = useModelRecoveryBatchStore(state => state.running);
  // Ref 与 state 分工：Ref 同步互斥，state 负责让按钮更新可见状态。
  // 不使用 state 闭包作为唯一互斥，连续点击可能在下一次提交前发生。
  // 主进程还会拒绝同目录的并发操作，覆盖多窗口及多个详情面板。
  const running = useRef(false);
  // revision 独立于外部扫描时间，文本恢复不要求重扫所有模型。
  // 每次读取都重新获得规范化数据，不把写入请求直接当成展示结果。
  // 刷新失败由现有读取 hook 显示，不吞掉写操作的真实结果。
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  // 记录发起请求时的路径，避免切换版本后展示上一个文件的结果。
  // 不以模型名称作为 key，同目录和跨目录都可能存在同名版本。
  // 最后的返回值会再次对照当前 filePath，过期结果只留在内存中。
  const [result, setResult] = useState<{ path: string; data: LocalModelRecoveryResult } | null>(null);
  /**
   * 先记录来源补全结果，再按需刷新封面，避免扫描耗时吞掉成功提示。
   * IPC/schema 抛错统一显示 io，不把错误误当成没有匹配模型。
   * finally 恢复按钮；网络超时也能够重试，不留下永久 loading。
   * 这里不自动循环重试，避免大模型被反复完整读取。
   * 扫描失败时下次手动扫描仍可看到已经保存的封面。
   */
  async function recover() {
    // 空路径只可能出现在没有版本的模型条目，不能提交目录作为替代。
    // 正在执行时直接返回，让同一个面板保持一次明确的用户操作。
    // 不自动重试读取，这会对大型模型产生重复磁盘负担。
    // 除按钮外也在动作入口检查批量状态，覆盖连续点击与程序化事件。
    // getState 读取实时值，不能只依赖上次 React 渲染捕获的布尔闭包。
    // 不阻止已有单个任务正常收尾，目录互斥继续由主进程兜底。
    if (!filePath || running.current || useModelRecoveryBatchStore.getState().running) return;
    // 清掉先前提示，避免新请求仍显示旧成功结果造成误解。
    // busy 会在文件切换后保持，表示旧事务仍在主进程中运行。
    // 页面不声称可以中断任务；本轮只提供有界的按需识别。
    running.current = true; setBusy(true); setResult(null);
    try {
      // 先存储本轮结果，用户可对照摘要确认正在识别的是哪个文件。
      // notFound/auth 等失败也是已验证的业务结果，不能改成 success。
      // 完成文本提交并不依赖封面服务始终可用。
      const data = await recoverLocalModelMetadata(filePath); setResult({ path: filePath, data });
      // noPreview/coverFailed 已经可能保存文字，必须刷新来源但不能称补全成功。
      // existing 也重读，兼容另一个窗口刚写入的资料。
      // 其余失败不递增 revision，保留当前已显示内容及真实失败提示。
      if (["recovered", "existing", "noPreview", "coverFailed"].includes(data.status)) setRevision(value => value + 1);
      // 新封面需要 scanner 返回 iconPath；只修改 hook 的 revision 不够。
      // scanAllModels 本身管理扫描状态，这里不再复制一份全局状态。
      // 扫描错误不否定已经保存的文件，用户稍后可手动重新扫描。
      if (data.cover === "saved") await useSettingsStore.getState().scanAllModels().catch(() => undefined);
    // 传输或 schema 失败无法可靠判断磁盘状态，因此提示检查后重试。
    // 不显示捕获到的 Error.message，避免原始 IPC 错误进入 UI。
    // 业务状态的详细原因已经由主进程结果表示，正常不会进入该分支。
    } catch { setResult({ path: filePath, data: { status: "io", sha256: "", cover: "none" } }); }
    finally { running.current = false; setBusy(false); }
  }
  // 组件只消费受控状态与动作，不需要接触 Electron 或模型文件内容。
  // current filePath 是最终展示条件，处理切换版本快于网络返回的情况。
  // recover 保持 Promise<void>，界面事件使用 void 且内部负责捕获异常。
  // 单项忙碌只表示当前按钮启动的请求，不能拿批量占用冒充单项进度。
  // batchRunning 仅供互斥禁用，用户未点击时仍看到原来的手动匹配入口。
  // 如同公共打印机被别人占用，不代表自己的文档已经开始打印。
  // 共享队列的逐项详情由批量面板展示，不把别的文件失败复制到这里。
  // 两个入口复用同一 cover 完成基准，避免单个成功而批量未完成的矛盾。
  // busy 不由当前文件是否已有来源推导，有资料也必须允许用户主动检查。
  // 批量占用不代表当前选中的文件属于它，不能给该文件绘制虚假的进度。
  // 单项请求的结果仍只按它发起时的路径显示，其他任务不能借用成功提示。
  // 这一拆分只改变可见状态，recover 入口的实时互斥判断保持原样。
  // 页面不通过把 batchRunning 清零来启用按钮，队列依然有独立生命周期。
  // 批量结束后原订阅自然恢复手动入口，不需要用户再点新模型才刷新。
  return { busy, batchRunning, revision, result: result?.path === filePath ? result.data : null, recover };
}
