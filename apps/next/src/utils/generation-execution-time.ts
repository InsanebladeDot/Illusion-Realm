/** 汇总同一任务的工作流耗时；像核对一叠收据，缺一张就不能把小计算成总额。 */
export interface GenerationExecution {
  id: string;
  server: string;
  promptId?: string;
  executionMs?: number;
}

/** 只在全部请求都有服务端记录时给出合计；同一服务的重复 prompt 不重复计时。 */
export function getWorkflowExecutionMs(executions: GenerationExecution[] | undefined): number | null {
  if (!executions?.length) return null;
  const seen = new Set<string>();
  let total = 0;
  for (const item of executions) {
    if (!item.promptId || typeof item.executionMs !== "number" || !Number.isFinite(item.executionMs) || item.executionMs < 0) return null;
    const key = JSON.stringify([item.server, item.promptId]);
    if (seen.has(key)) continue;
    seen.add(key);
    total += item.executionMs;
  }
  return Number.isFinite(total) ? total : null;
}
