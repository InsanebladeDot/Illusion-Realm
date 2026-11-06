"use client";
/**
 * 本地模型页的批量补全入口与结果列表，复用单文件状态词条和卡片筛选结果。
 * 队列状态在 Zustand 中，组件卸载后仍运行，返回页面可继续查看。
 * 当前批次展示完整快照，不随用户后续筛选而隐藏失败项目。
 * 初始只显示入口，开始后出现可收起的逐项结果，保持卡片浏览空间可恢复。
 * 状态理由直接显示在每个模型版本下方，不要求用户先打开来源详情。
 * 已停止项明确说明尚未执行，避免用户误认为这些模型已在网站查询过。
 * logo 未完成与模型不存在使用不同文案，方便决定重试还是手动设置封面。
 * 受限类型与原有资料损坏同样保留原因，不用通用红框掩盖具体失败。
 * 关闭客户端不会由该组件继续执行队列，持久化资产仍由主进程正常保存。
 * 封面统计依赖本轮结果，不把卡片的占位图或文字缩略图当作真实 logo。
 */
import { useState } from "react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { CheckCircle2, CircleAlert, Clock3, LoaderCircle, ScanSearch } from "lucide-react";
// 图标沿用项目现有库，没有为批量操作新增一套图片素材或资源卡片。
// 数据与 i18n 依赖来自已有基础模块，组件只负责显示和调用 store 动作。
// 不直接访问 window.electronAPI，单文件识别契约继续由 bridge 验证。
import { useTranslation } from "@/i18n";
import type { LocalModel } from "@/types/localModel";
import { isModelRecoveryComplete, useModelRecoveryBatchStore, type ModelRecoveryBatchItem } from "@/stores/use-model-recovery-batch-store";
/**
 * 每行使用具体文件版本的名称，不把同目录多个文件合成一次成功。
 * 运行中只描述整个识别过程，不伪造“已下载百分比”或磁盘读取字节进度。
 * 共享失败状态直接映射到单个模型补全相同的原因词条。
 * 正在等待和主动停止分别呈现，用户不会把未执行项误认为查询失败。
 * 图标不承载唯一语义，颜色之外还有明确文字，便于识别未完成原因。
 * 长模型名使用换行与 min-w-0，窄屏不会把结果容器撑出主区域。
 */
function RecoveryRow({ item }: { item: ModelRecoveryBatchItem }) {
  // complete 与统计、重试使用同一函数，行图标不会与页面总数互相矛盾。
  // done 只代表检查结束，仍要读取具体结果才能知道是否有 logo。
  // 未执行项 result 为空，不能使用上次批次的状态作为占位。
  const { t } = useTranslation(), complete = isModelRecoveryComplete(item.result);
  const Icon = item.phase === "running" ? LoaderCircle : complete ? CheckCircle2 : item.result ? CircleAlert : Clock3;
  // 运行态显示 spinner，未完成显示警示，但具体原因始终有文字可读。
  // notFound 使用明确的 Civitai 未收录文案，不笼统提示“操作失败”。
  // metadataInvalid/unsupportedType 同样保留准确原因，不从列表静默排除。
  const message = item.result ? t(`toolBox.civitai.metadata.recovery.${item.result.status}`) : t(`toolBox.civitai.recoveryBatch.${item.phase === "done" ? "waiting" : item.phase}`);
  // data-phase 和 data-result 供现有冒烟定位实际状态，不把 label 当测试选择器。
  // 正常交互仍完全依靠按钮和文字，data 属性不参与业务逻辑判定。
  // 结果文案经共享枚举约束，新增状态漏词条会被类型检查发现。
  return <li data-recovery-batch-item data-phase={item.phase} data-result={item.result?.status || ""} className="flex min-w-0 gap-2 rounded-lg border border-border px-3 py-2 text-xs">
    {/* 界面：结果图标与具体模型版本；失败原因不依赖 hover 才出现。 */}
    {/* 图标 aria-hidden，避免辅助工具重复朗读装饰性含义。 */}
    {/* 颜色使用显式明暗主题样式，错误不是红色粗边框的唯一提示。 */}
    {/* 模型名称和原因分行，长文件名不挤占状态图标的固定空间。 */}
    <Icon size={15} aria-hidden className={`mt-0.5 shrink-0 ${item.phase === "running" ? "animate-spin text-primary" : complete ? "text-emerald-600 dark:text-emerald-400" : item.result ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
    <div className="min-w-0 space-y-1"><p className="break-words font-medium">{item.label}</p><p className="break-words leading-relaxed text-muted-foreground">{message}</p></div>
  </li>;
}
/**
 * 点击即冻结当前筛选全部模型的版本，不使用后台自动扫描触发批量识别。
 * 按钮标出文件数，避免卡片数量与同目录多个版本数量混淆。
 * 停止按钮仅阻止后续提交，提示明确说明当前文件仍会安全完成。
 * 统计成功必须通过 isModelRecoveryComplete，JSON 先保存但没有 logo 仍是未完成。
 * retry 仅重新提交失败/已停止项，已完成项保持记录，便于对照统计。
 * 原有移动/删除多选时禁用新批次，避免在同一页面同时组织冲突操作。
 * 进度区域有最大高度与内部滚动，批量结果不会挤走整个卡片网格。
 */
function RecoveryBatchPanel({ models, disabled }: { models: LocalModel[]; disabled: boolean }) {
  // 订阅会话级队列，重新进入页面不需要主动触发 start 或恢复 effect。
  // 执行循环独立于此组件，卸载只移除订阅，不中断未结束的事务。
  // 模型参数只用于新批次范围，已有批次结果始终从 store.items 读取。
  const { t } = useTranslation(), batch = useModelRecoveryBatchStore();
  const count = new Set(models.flatMap(model => model.versions.map(version => version.filePath.toLowerCase()))).size;
  // 页面显示的是版本文件数，与卡片模型数区分，避免用户误解批量总量。
  // 每个同名不同路径文件仍独立计数，只有相同文件路径才会去重。
  // 主进程最终验证路径，本地计数不是授权，也不直接读取文件内容。
  const completed = batch.items.filter(item => isModelRecoveryComplete(item.result)).length;
  // processed 表示已收到终态的文件，失败也属于已检查，不伪造为尚未执行。
  // waiting、running、cancelled 不进入已检查数，停止后总量仍保留原范围。
  // completed 只收有来源与可显示 logo 的结果，杜绝 JSON 数字虚高。
  const processed = batch.items.filter(item => item.phase === "done").length;
  const incomplete = batch.items.filter(item => item.phase === "done" && !isModelRecoveryComplete(item.result)).length;
  // incomplete 不把尚未开始项当网站错误，停止原因另在对应行显示。
  // retryable 包括主动停止项，因为用户可能希望在同一快照上继续处理。
  // 已完成项不能在重试时再次发起 GB 级读取，store 动作还会独立检查。
  const retryable = batch.items.some(item => item.phase === "cancelled" || item.phase === "done" && !isModelRecoveryComplete(item.result));
  // section 使用页面原有背景、圆角和边框 token，不额外覆盖 nav/main 的配色。
  // data-running 由真实 store 值驱动，测试能对照按钮状态与队列生命周期。
  // 无任务时只展示紧凑入口及完成基准，不出现空的大型结果列表。
  return <section data-local-model-recovery-batch data-running={batch.running} className="space-y-3 rounded-xl border border-border bg-background p-3">
    {/* 界面：批量补全当前筛选范围；包含每张模型卡片下的全部文件版本。 */}
    {/* 按钮不会触发全库补全，只提交此刻筛选得到的模型对象快照。 */}
    {/* 搜索和分类后 count 同步更新，用户在点击前即可确定操作范围。 */}
    {/* running 时禁用新启动，停止按钮在结果区域独立提供。 */}
    <div className="flex flex-wrap items-center gap-3"><div className="mr-auto min-w-0"><h3 className="text-xs font-semibold">{t("toolBox.civitai.recoveryBatch.title")}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("toolBox.civitai.recoveryBatch.scope", { count })}</p></div><button type="button" data-local-batch-recover disabled={disabled || batch.running || !count} onClick={() => batch.start(models)} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"><ScanSearch size={14} />{t("toolBox.civitai.recoveryBatch.start")}</button></div>
    {/* 界面：完成基准明确包含 logo；没有合适封面不计入成功总数。 */}
    {/* hint 不描述 SHA-256 的内部缓冲机制，保留对用户有用的完成规则。 */}
    {/* 当前可读资料和封面是否完整最终由主进程判定，页面不看 iconPath 猜测。 */}
    {/* 原有资料只保留而不可读取时，会通过逐项原因解释，不标成成功。 */}
    <p className="text-xs leading-relaxed text-muted-foreground">{t("toolBox.civitai.recoveryBatch.hint")}</p>
    {batch.items.length > 0 && <details open data-recovery-batch-results className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-medium" aria-live="polite">{t("toolBox.civitai.recoveryBatch.progress", { processed, total: batch.items.length, completed, incomplete })}</summary>
      {/* details 可由用户收起，避免处理很多模型时结果占满卡片浏览区域。 */}
      {/* summary 使用低优先级播报，不会在每个文件完成时强制打断当前操作。 */}
      {/* 总量来自启动快照，筛选条件变化不改变正在处理的进度分母。 */}
      {/* 界面：停止后续任务 / 重试未完成项，已完成结果始终保留。 */}
      {/* 正在停止时按钮禁用并显示等待当前项结束，不能误导为已强行中断。 */}
      {/* 未完成项为零时重试禁用，用户可通过搜索条件启动另一个明确范围。 */}
      {/* 运行提示说明切页仍继续，不额外弹阻断导航的确认框。 */}
      <div className="my-3 flex flex-wrap items-center gap-2">{batch.running ? <><button type="button" data-recovery-batch-stop disabled={batch.stopRequested} onClick={batch.stop} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">{t(batch.stopRequested ? "toolBox.civitai.recoveryBatch.stopping" : "toolBox.civitai.recoveryBatch.stop")}</button><span role="status" className="text-xs text-muted-foreground">{t("toolBox.civitai.recoveryBatch.continueHint")}</span></> : <button type="button" data-recovery-batch-retry disabled={!retryable || disabled} onClick={batch.retry} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">{t("toolBox.civitai.recoveryBatch.retry")}</button>}</div>
      {/* 扫描失败提示与逐项结果分开，不能将已保存资料的任务改成查询失败。 */}
      {/* 图片是否可用已经由恢复器解码核验，列表刷新异常不撤销磁盘资产。 */}
      {/* ul 独立滚动且不限定固定宽度，窄屏时原因可以自然换行。 */}
      {/* 每行 key 使用原始版本文件路径，复用模型名称会使多个版本状态串行。 */}
      {batch.scanFailed && <p role="alert" className="mb-3 text-xs text-amber-600 dark:text-amber-400">{t("toolBox.civitai.recoveryBatch.scanFailed")}</p>}
      <ul className="max-h-64 space-y-2 overflow-auto" aria-label={t("toolBox.civitai.recoveryBatch.results")}>{batch.items.map(item => <RecoveryRow key={item.path} item={item} />)}</ul>
    </details>}
  </section>;
}

// 管理按钮和完整结果复用同一个 store，不为新的三栏布局重写补全循环。
// compact 只改变入口形态：主按钮位于搜索右边，结果进入资源弹窗。
// 打开面板只查看范围，内部明确点击“开始”后才读取权重和查询网站。
// 关闭弹窗只关闭阅读界面，队列仍按现有会话生命周期继续执行。
// 返回结果时不会自动再启动任务，避免一次查看又读完整个模型库。
// 正在执行时允许打开结果窗口，禁止重复启动由原 store 和内部按钮保证。
// 空筛选没有可处理目标，入口禁用而不是显示虚假的完成反馈。
// 未使用 compact 的调用方继续获得原完整面板，公共行为不被布局变化替换。
// 弹窗继续沿用 ResourceDialogShell 的焦点、Escape 和主题规则。
// compactLeft 来自宿主实际测量，避免导航缩窄后仍留下旧版固定宽度的空白。
// 未提供该参数的完整面板保持原行为，不把新布局测量强制引入其他消费处。
// 列表卸载不会清空 running 状态，下一次进入可以继续查看原批次。
// 首个批次也不由入口创建，查看范围和开始执行必须是两个明确动作。
// 已有任务时入口只查看结果；新的启动由完整面板的开始按钮明确触发。
export function LocalModelRecoveryBatch({ models, disabled, compact = false, compactLeft }: { models: LocalModel[]; disabled: boolean; compact?: boolean; compactLeft?: number }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false);
  const hasItems = useModelRecoveryBatchStore(state => state.items.length > 0);
  // 不论有无记录，点击都只打开面板，不调用 start 或改变原队列范围。
  // 完成后重新查看也不能自动重读 GB 级模型，必须由面板显式开始新批次。
  // 当前搜索为空仍允许查看旧批次结果，旧结果不是当前筛选模型的成功证明。
  // hasItems 只订阅是否存在记录，不复制全部任务列表到入口组件里。
  // 当前处于多选管理时仍禁用新入口，避免两种批量范围在一次点击中混淆。
  // 初次没有记录而当前没有模型时禁用，不能创建一个假成功的零项队列。
  // 冻结范围在 store 内完成，打开弹窗后筛选变化不能改写该批任务。
  // 弹窗内容使用同一个完整面板，因此重试与停止不会因 compact 形态产生新规则。
  // 按钮没有声明立即成功，文件是否完整始终依靠逐项真实返回。
  // disabled 来自当前扫描和多选模式，它们会让新批次的目标范围不明确。
  // running 本身不禁用查看能力，用户在切页后仍有入口回到正在执行的批次。
  // start 只由完整面板的开始按钮调用；异步失败由队列处理器逐项承接。
  // 即使用户马上关闭此弹窗，也不会中断已经提交的单文件来源事务。
  // compact 默认 false，现有完整面板可以在独立资料场景继续使用。
  // 这里不读取 logo 路径判断成功，避免把占位或损坏图片算作补全完成。
  // 第一次查看也只打开窗口，用户可以先核对当前筛选的文件数再决定。
  // 关闭未开始的面板不需要停止任务，因为此时根本没有提交任何文件。
  // 有既有批次时仍只读取 store 的结果，不能把背景筛选替换成新的快照。
  // 重新开始和重试是完整面板的两个动作，入口不猜用户想选哪一个。
  // 切页回来只需打开即可查看，不能以“恢复页面”为由自动恢复被停止项。
  // disabled 仍由调用方决定，明确多选操作中不创建另一套补全范围。
  // 组件挂载时没有 effect 调用此动作，不存在初始化后悄悄匹配的问题。
  // 模型数组只作为未来开始的候选，不代表用户已经同意逐个读取权重。
  function activate() {
    setOpen(true);
  }
  return compact ? <><button type="button" data-local-batch-recover disabled={disabled || (!models.length && !hasItems)} onClick={activate} className="bg-primary text-primary-foreground"><ScanSearch size={14} />{t("toolBox.civitai.recoveryBatch.title")}</button><ResourceDialogShell open={open} compactLeft={compactLeft} onOpenChange={setOpen} title={t("toolBox.civitai.recoveryBatch.title")} titleId="model-batch-recovery-title"><RecoveryBatchPanel models={models} disabled={disabled} /></ResourceDialogShell></> : <RecoveryBatchPanel models={models} disabled={disabled} />;
}
// compact 的 disabled 不包含 running，运行时点击是查看结果而非启动第二批。
// 内部开始按钮仍包含 running 禁用条件，两处入口遵守同一真实执行状态。
// 查看结果和启动按钮使用不同所在区域，不把关闭弹窗误当成停止队列。
// 停止后续项、重试失败项仍由原完整面板呈现，具体原因没有因视觉精简丢失。
// 批量操作范围来自调用方当前 filtered 模型，不跨类别扩大磁盘读取范围。
// 不在这里捕获主进程错误伪造成功；原 store 逐项处理失败并保留结果。
