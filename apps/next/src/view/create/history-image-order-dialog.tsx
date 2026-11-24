"use client";
import { HoverTip } from "@/components/hover-tip";


/** 当前文件夹图片的手动顺序与批量改名弹窗，完成/取消均回到打开它的图库。 */
// 图库排序只改展示队列，批量改名默认关闭；复用拖拽容器、改名控件和资源页外壳。
import { useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, ImageOff, LoaderCircle, Pencil } from "lucide-react";
import { SortableList } from "@/components/sortable-list";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useHistoryImageOrder } from "@/hooks/use-history-image-order";
import { previewHistoryImageNames, validateHistoryImageNames, renameHistoryImageSequence } from "@/utils/history-image-order";
import { hasRenameGeneratedImageSupport } from "@/utils/electronBridge";
import { LocalFileImage } from "@/components/LocalFileImage";
import { RenameConfig } from "@/view/toolBox/Tool/exif/components/RenameConfig";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { GeneratedImageFile } from "@/types/historyFolder";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import type { RenameGeneratedImageResult } from "@/utils/generatedImages";


// 拖动只改草稿，确认才保存顺序；改名执行中锁住编辑和关闭，取消不能回滚磁盘操作。





// 完整路径是排序身份：外部改名视为新文件，软件内改名则按回执保留原位置。
// 各目录分别保存队列，不按文件内容计算哈希。

interface HistoryImageOrderDialogProps {
  // 当前打开目录的完整图片集合，包含分页外或被搜索暂时隐藏的图片。
  // 不接收选中图片子集，避免同一目录里有文件没参与命名冲突检查。
  images: GeneratedImageFile[];
  // 当前应用的输出根配置，正式图片接口用它验证允许操作的路径范围。
  // 空字符串仍沿用原接口的默认输出根解析，不能改成任意用户路径权限。
  outputPath: string;
  // 目录路径用作排序偏好的键，“全部”目录由父层解析成当前有效输出根。
  // 不用可重名的显示标题作键，避免两个同名文件夹共享一个队列。
  folderKey: string;
  // 上次确认的路径名单；它不包含图片内容，也不会用名称替代文件身份。
  // 父层从同一个 historyFolders 段读取，跨入口看到同一套已确认排序。
  savedOrder: string[];
  // 保存展示顺序，回调不代表批量文件移动；每个目录由 store 分开保存。
  // 重命名后传回替换过的新路径，否则下次扫描无法匹配已经改名的图片。
  onSave: (folder: string, paths: string[]) => void;
  // 每个真实成功回执都通知父层，只有实际完成的文件才更新图库记录。
  // 第一参是旧身份，第二参是新记录，父层可同步当前预览和多选状态。
  onRenamed: (oldPath: string, image: GeneratedImageFile) => void;
  // 关闭仍由来源图库控制；取消、成功和部分完成都通过同一个生命周期收尾。
  // 父层负责恢复入口焦点，本窗口不保存来源按钮 DOM 引用。
  onClose: () => void;
}

/** 排序和批量改名共用原图清单，任一操作完成后都按文件路径刷新当前记录。 */
export function HistoryImageOrderDialog({ images, outputPath, folderKey, savedOrder, onSave, onRenamed, onClose }: HistoryImageOrderDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore(state => state.show);
  const order = useHistoryImageOrder(images, savedOrder, folderKey, onSave);
  // 编号方向只影响新名称，不反转排列；仅排序时不要求用户改名。
  const [prefix, setPrefix] = useState("image_");
  const [start, setStart] = useState(1);
  const [ascending, setAscending] = useState(true);
  const [renameEnabled, setRenameEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const preview = useMemo(() => previewHistoryImageNames(order.items, prefix, start, ascending), [ascending, order.items, prefix, start]);
  // ref 像门闩，当次点击立即扣住；state 像门口灯，下一帧让按钮显示忙碌。
  // 只用 state 会给同一帧的快速双击留下两次进入异步操作的机会。
  // 这个锁不属于全局 store，另一个图库打开自己的窗口不会被错误锁住。
  const lock = useRef(false);
  // failure 记录实际执行错误；validation 表示当前输入尚不满足规则。
  // 两者分别保存，用户改输入不能让未完成的磁盘改名被误报成成功。
  // 新一次明确执行时清空旧 failure，避免把上次失败当成本次结果。
  const [failure, setFailure] = useState<string | null>(null);
  const validation = renameEnabled ? validateHistoryImageNames(order.items, prefix, start, ascending) : null;
  // 只按实际改名回执替换路径，不把尚未完成的预览计划当成成功。
  const completeRename = (results: RenameGeneratedImageResult[], sourceOrder: string[], error: string | null) => {
    // 像改名登记簿：完成一项才盖章换路径，其余文件仍留在原位置。
    const replacements = new Map(results.map(result => [result.oldPath, result.filePath]));
    // 回执自身包含完整图像记录字段，交给父层按 oldPath 替换。
    // 更新图库并不打开图片详情，排序不能顺带打断用户当前的预览任务。
    // 父层如果正在预览这张旧路径，会从这个通知同步到新文件。
    results.forEach(result => onRenamed(result.oldPath, result));
    // 零项成功保留窗口供修正；部分成功按真实名单保存并提示，不能声称已回滚。
    if (error) {
      const message = t("create.historyOrder.renamePartial", { count: results.length, reason: error });
      setFailure(message);
      if (!results.length) return;
      toast(message);
    } else toast(t("create.historyOrder.renameComplete", { count: results.length }));
    onSave(folderKey, sourceOrder.map(path => replacements.get(path) ?? path));
    onClose();
  };
  const rename = async () => {
    // UI 按钮之外再检查一次锁和输入，不能依赖 disabled 作为唯一操作边界。
    // 功能探测用于普通浏览器或旧桥接环境；缺能力时给明确原因，保留用户草稿。
    // 不把缺少改名方法当作空结果成功，也不退化成仅修改卡片上的显示名称。
    if (lock.current || validation) return;
    if (!hasRenameGeneratedImageSupport()) { setFailure(t("create.generatedImageContextMenu.renameUnsupported")); return; }
    lock.current = true; setWorking(true); setFailure(null);
    // 进入 try 之后的请求和回执处理都有失败边界，未知错误不会留下未处理拒绝。
    // sourceOrder 和 preview 在第一次 await 之前确定，形成同一次确认的执行计划。
    // 外部生成通知可能刷新图库；不能让刷新中的新项插入已开始的命名计划。
    try {
      // 先冻结用户确认的顺序；改名回调会逐项刷新父图库，不能用刷新中的列表重排余项。
      const sourceOrder = order.items.map(image => image.filePath);
      const outcome = await renameHistoryImageSequence(outputPath, preview);
      completeRename(outcome.results, sourceOrder, outcome.error);
    } catch (error) { setFailure(error instanceof Error ? error.message : t("create.historyOrder.renameFailed")); }
    // 成功、部分完成和失败都释放锁，防止一次失败使当前窗口永久无法操作。
    // working 负责恢复输入和手柄，lock 负责恢复下一次同步点击的进入资格。
    // 没有后台轮询或进度模拟，忙碌状态只包围真实文件请求。
    finally { lock.current = false; setWorking(false); }
  };
  // 保存按钮根据明确的用户开关选择行为，命名设置隐藏时绝不发出改名 IPC。
  // 纯排序写回 store 后结束窗口，不需要读取图片内容或重新编码图片。
  // rename 内部已经捕获异步错误，这里的 void 不会遗失未处理的拒绝。
  const save = () => {
    if (renameEnabled) { void rename(); return; }
    order.confirm(); onClose();
  };
  // 文件操作中用即时 ref 锁拒绝关闭，避免 state 还没刷新时被快速 Escape 绕过。
  const close = () => { if (lock.current) return; order.cancel(); onClose(); };
  const toolbar = (
    // 图库设置区：fieldset 统一禁用已有 RenameConfig 的所有输入和子按钮。
    // 使用原生禁用传播，不往 EXIF 控件添加图库业务专用的多个开关。
    // 标题与输入继续共用主题语义色，深浅模式由应用主题机制驱动。
    <fieldset disabled={working} className="flex min-w-0 flex-col gap-3 px-4 py-3">
      <p className="text-xs text-muted-foreground">{t("create.historyOrder.hint", { count: order.items.length })}</p>
      {/* 改名设置区：复用 EXIF 控件，预览前五项，执行完整计划。 */}
      <RenameConfig title={t("create.historyOrder.renameTitle")} enabled={renameEnabled} onToggle={setRenameEnabled}
        prefix={prefix} onPrefixChange={setPrefix} startNumber={start} onStartNumberChange={setStart}
        ascending={ascending} onAscendingChange={setAscending}
        preview={renameEnabled ? <div className="max-h-24 space-y-1 overflow-auto text-xs">{preview.slice(0, 5).map(item => <HoverTip key={item.image.filePath} asChild layer="window" label={`${item.image.fileName} → ${item.name}`}><div key={item.image.filePath} className="truncate">{item.image.fileName} → {item.name}</div></HoverTip>)}{preview.length > 5 && <span>{t("create.historyOrder.more", { count: preview.length - 5 })}</span>}</div> : undefined} />
      {(validation || failure) && <p data-order-error role="alert" className="text-xs text-destructive">{validation ?? failure}</p>}
    </fieldset>
  );
  const footer = (
    // 图库操作区：数量和确认固定在底部，不随长图片清单滚出屏幕。
    // 取消默认接收焦点，打开窗口不会因为按下 Enter 就直接执行磁盘批量改名。
    // 缺图或尚未加载的缩略图不影响按名称和路径排列，按钮依据图片记录而非像素状态。
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <span data-order-count className="text-xs text-muted-foreground">{t("create.historyOrder.count", { count: order.items.length })}</span>
      <div className="flex gap-2">
        <button type="button" data-order-cancel autoFocus disabled={working} onClick={close} className={"inline-flex h-9 items-center rounded-md border px-3 text-sm " + INPUT_BORDER_CLASS}>{t("common.cancel")}</button>
        <button type="button" data-order-confirm disabled={working || order.items.length === 0 || Boolean(validation)} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm text-background disabled:opacity-50">
          {/* 确认按钮：按实际动作显示排序或改名。 */}
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : renameEnabled ? <Pencil className="h-4 w-4" /> : <Check className="h-4 w-4" />}{renameEnabled ? t("create.historyOrder.renameAction") : t("create.historyOrder.applyOrder")}
        </button>
      </div>
    </div>
  );
  return (
    // 图库排序页：外壳承接返回和 Escape，业务 close 再统一判断是否允许关闭。
    // 关闭回调不直接写入 store，只有确认按钮才会提交排序偏好。
    // bodyClassName 只调整本业务的列表留白，没有复制弹窗定位与宽高规则。
    <ResourceDialogShell open title={t("create.historyOrder.title")} titleId="history-image-order-title" description={t("create.historyOrder.description")} toolbar={toolbar} footer={footer} onOpenChange={open => { if (!open && !working) close(); }} closeLabel={t("common.close")} bodyPadded={false} bodyClassName="px-4 py-3">
      {order.items.length === 0 ? <p data-order-empty className="p-8 text-center text-sm text-muted-foreground">{t("create.historyOrder.empty")}</p> : (
        // 容器与手柄一起禁用，改名期间不能改变执行队列。
        <SortableList ids={order.items.map(image => image.filePath)} layout="vertical" disabled={working} onMove={order.move}>
          <div data-history-order-list className="space-y-2">
            {order.items.map((image, index) => <SortableOrderCard key={image.filePath} image={image} index={index} label={t("create.historyOrder.drag", { name: image.fileName })} disabled={working} />)}
          </div>
        </SortableList>
      )}
    </ResourceDialogShell>
  );
}

/** 抓取点沿用同一个 dnd-kit 子项，不让点击预览卡片本身开始拖动。 */
// 用原拖拽库处理整行位移，抓取按钮独立，正文仍可选中文字和滚动。
function SortableOrderCard({ image, index, label, disabled }: { image: GeneratedImageFile; index: number; label: string; disabled: boolean }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: image.filePath, disabled });
  return <article ref={setNodeRef} data-order-image={image.filePath}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    className={(isDragging ? "relative z-10 shadow-md " : "") + "flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-2"}>
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs tabular-nums">{index + 1}</span>
    <LocalFileImage filePath={image.filePath} alt="" className="h-14 w-14 shrink-0 rounded object-cover"
      fallback={<span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"><ImageOff size={18} /></span>} />
    <HoverTip asChild layer="window" label={(image.fileName) ?? ""}><span className="min-w-0 flex-1 truncate text-sm">{image.fileName}</span></HoverTip>
    <HoverTip asChild layer="window" label={(label) ?? ""}><button ref={setActivatorNodeRef} type="button" disabled={disabled} {...attributes} {...listeners} data-order-handle={image.filePath} aria-label={label}
      className="flex h-8 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke">
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button></HoverTip>
  </article>;
}
