"use client";

import { useEffect, useMemo, useState } from "react";
// 主区页和普通弹窗共用同一 React 子树，仅 portal 目标和布局方式不同。
// 不通过复制列表或路由跳转实现替换，避免新增/编辑状态与原短语 store 脱节。
import { createPortal } from "react-dom";
import { ChevronLeft, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { useCreateMainPage } from "@/hooks/use-create-main-page";
import {
  filterQuickPhrases,
  QUICK_PHRASE_DESCRIPTION,
} from "@/data/quickPhrases";
import { useQuickPhraseStore } from "@/stores/useQuickPhraseStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { QuickPhrase, QuickPhraseViewMode } from "@/types/quickPhrase";
import { insertPromptText } from "@/utils/quickPhrases";
import { CreateQuickPhraseDialog } from "@/view/create/CreateQuickPhraseDialog";
import { QuickPhraseCard } from "@/view/create/QuickPhraseCard";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type QuickPhraseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUsed?: () => void;
};

export function QuickPhraseDialog({
  open,
  onOpenChange,
  onUsed,
}: QuickPhraseDialogProps) {
  const { t } = useTranslation();
  // 由创建页父容器提供展示区域，离开创建路由仍使用原对话框布局。
  // open 为 false 时不登记页面；组件常驻不会导致创建工作区一直处于隐藏状态。
  // 关闭事件仍回到 PromptSection，调用者继续控制打开状态和使用后的提示词更新。
  // 该登记不包含 search、viewMode 或编辑草稿，临时视图栈只管理展示区域。
  // 返回后原 contenteditable 节点仍在工作区中，短语插入目标不会因页面替换而丢失。
  // 模型库使用共享外壳，本组件独立接入宿主，保留原列表/网格及创建子对话框结构。
  const mainPage = useCreateMainPage(open);
  const phrases = useQuickPhraseStore((state) => state.phrases);
  const addPhrase = useQuickPhraseStore((state) => state.addPhrase);
  const updatePhrase = useQuickPhraseStore((state) => state.updatePhrase);
  const removePhrase = useQuickPhraseStore((state) => state.removePhrase);
  const showToast = useToastStore((state) => state.show);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<QuickPhraseViewMode>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<QuickPhrase | null>(null);

  /**
   * 渲染期同步：**每次**「关闭 → 打开」都回到初始视图（清搜索、回列表、关闭新建/编辑）。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：必须在两个方向上记录前值（而不是只在 open 为真时记录），
   * 否则第二次打开时 `open === 前值` 会跳过重置。
   */
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setSearch("");
      setViewMode("list");
      setCreateOpen(false);
      setEditingPhrase(null);
    }
  }

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (createOpen) {
          setCreateOpen(false);
          setEditingPhrase(null);
          return;
        }
        onOpenChange(false);
      }
    };

    // 主区子页不锁 body，避免正常文档流页面滚动状态干扰创建页；旧 body 弹窗仍需锁滚动。
    // 打开的新建/编辑短语仍优先处理 Escape，这一层只在子对话框关闭后返回创建页。
    // 锁和还原使用同一 host 条件，避免主区页 cleanup 覆盖其他对话框的 overflow。
    // 依赖 host 是因为创建页父组件在挂载后提供 DOM 宿主，初次 effect 时它可能尚为空。
    // 事件监听在关闭与卸载时一起移除，避免工具退出后 Escape 仍触发过期回调。
    const previousOverflow = document.body.style.overflow;
    if (!mainPage.host) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      if (!mainPage.host) document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mainPage.host, open, onOpenChange, createOpen]);

  const filteredPhrases = useMemo(
    () => filterQuickPhrases(phrases, search),
    [phrases, search]
  );

  const handleOpenCreate = () => {
    setEditingPhrase(null);
    setCreateOpen(true);
  };

  const handleEdit = (phrase: QuickPhrase) => {
    setEditingPhrase(phrase);
    setCreateOpen(true);
  };

  const handleUse = (phrase: QuickPhrase) => {
    insertPromptText(phrase.promptText);
    onUsed?.();
    onOpenChange(false);
  };

  const handleSave = (input: {
    keyword: string;
    promptText: string;
    imagePath: string | null;
  }) => {
    const duplicate = phrases.some(
      (phrase) =>
        phrase.keyword === input.keyword && phrase.id !== editingPhrase?.id
    );
    if (duplicate) {
      showToast(t("create.quickPhraseDialog.duplicate", { keyword: input.keyword }));
      return;
    }

    if (editingPhrase) {
      updatePhrase(editingPhrase.id, input);
    } else {
      addPhrase(input);
    }
    setEditingPhrase(null);
  };

  if (!open) return null;

  const handleClose = () => onOpenChange(false);

  // 有宿主时整个列表填满 main，原表单已由父组件隐藏，不需要遮罩或提升覆盖层级。
  // 没有宿主时仍是原居中弹窗，保证组件在其他调用位置具有原来的关闭行为。
  // 主区页面保持 role=dialog 以兼容已有定位，但移除 aria-modal，让 nav 可继续操作。
  // 不使用 fixed/absolute 计算主区偏移，标题栏和导航留白完全来自父容器的真实布局。
  // 百分比高度继承宿主；列表自身 flex-1/overflow-y-auto 继续负责长内容滚动。
  // motion-none 排除全局 dialog 缩放动画，避免工具页边缘在入场时短暂露出空隙。
  // 返回按钮在正常流中占一行，不使用旧弹窗的绝对定位关闭图标覆盖列表内容。
  // 原弹窗继续使用 X；主区页使用 ChevronLeft，表达回到创建工作区的导航动作。
  // 两者都使用相同的 common.close 无障碍名称，原关闭逻辑和键盘访问不发生分叉。
  // 搜索框、视图切换和新建入口保持在相同组件中，不因 portal 目标改变而重置。
  // CreateQuickPhraseDialog 仍是编辑当前短语的子对话框，没有把表单编辑误当成顶层路由。
  // 保存继续通过原 addPhrase/updatePhrase 写入 store，主区替换不引入额外持久化写入。
  // 使用短语继续调用 insertPromptText，然后关闭页面；隐藏的编辑器仍是实际插入目标。
  // 空列表提示也在主区页中显示，UI 不依赖用户必须先有短语才能正常打开。
  // 宿主与工作区是兄弟节点，不能把 portal 指向原 PromptSection 的隐藏子树。
  // React portal 保持事件所有权，原 onSave/onUsed 回调不需要改为全局事件或 IPC。
  // 主区模式不携带 sm:max-h 等弹窗约束，宽度和高度始终与 main 的可用尺寸一致。
  // 宿主不存在时才保留旧阴影与边框，避免正常流页面在 main 中呈现悬浮卡片。
  // 文字仍使用既有 i18n 词条，此次布局改动不把参考图的示例内容写入用户数据。
  // 新建子对话框保留原草稿关闭规则；主区返回不自动保存未确认的短语。
  // 组件卸载时 hook 负责退栈，因此点击 nav 离开创建页也不会留下空白主区状态。
  // 搜索和视图模式的“重新打开时重置”规则仍由原 previousOpen 分支控制。
  // 将返回按钮放进布局流，也能让系统字号变大时为控件保留真实高度而非覆盖标题。
  // 大列表的卡片继续使用原 key，目标容器改变不会创建第二套短语实例。
  // 该布局没有文件读取或远程请求副作用，图片选择仍由原子对话框负责。
  // 关闭页时卸载的是 portal 内容，隐藏的创建页表单本身继续保持挂载。
  // 主区域滚动条留在列表主体，工具条和返回入口保持可见，不随卡片滚出屏幕。
  // body 回退保证非创建场景不要求 CreateMainArea，组件无需依赖固定的路由字符串。
  // ref 宿主由路由父组件管理，本组件不创建临时 DOM 节点，也不在关闭时手动 remove。
  return createPortal(
    <>
      {!mainPage.host && <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={handleClose}
      />}

      <div
        role="dialog"
        aria-modal={mainPage.host ? undefined : true}
        data-quick-phrase-main-page={Boolean(mainPage.host) || undefined}
        aria-labelledby="quick-phrase-dialog-title"
        className={cn(
          mainPage.host ? "motion-none flex h-full min-h-0 w-full flex-col overflow-hidden bg-background pt-4" : "fixed left-1/2 top-1/2 z-[90] flex h-[100dvh] max-h-[100dvh] w-[calc(100vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border bg-background shadow-lg duration-200 outline-none sm:h-[min(85vh,640px)] sm:max-h-[min(85vh,640px)] sm:w-[min(calc(100vw-2rem),560px)] sm:rounded-xl",
          THIN_BORDER_CLASS
        )}
        style={{
          // 正常流替换页的安全边距由应用head处理，不能再叠加16px顶部空白。
          // body弹窗保留原安全区；仅单栏宿主中的短语页使用40px紧凑标题。
          // 这不改变短语搜索、新建或插入回调，也不清理当前编辑草稿。
          paddingTop: mainPage.host ? 0 : "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* 界面：短语页返回与标题同排；宽屏contents保持原浮动关闭按钮布局。 */}
        {/* 这个包装层只负责页头，不包含搜索与列表，避免压缩可滚动主体。 */}
        {/* 短语说明继续保留，紧凑样式将两行文字居中放入40px。 */}
        <div data-quick-phrase-header className={mainPage.host ? "flex h-10 shrink-0 items-center gap-2 border-b border-border px-2" : "contents"}>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={handleClose}
          // 返回命中区32px，上下各留4px，不再独占一行增加页头高度。
          // 只在宿主页采用此尺寸，宽屏右上角X继续沿用原位置。
          // aria-label与原handleClose保持不变，Escape仍由既有监听处理。
          className={mainPage.host ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted" : "absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-sm:left-4 max-sm:right-auto sm:left-auto"}
        >
          {mainPage.host ? <ChevronLeft className="h-5 w-5" /> : <X className="h-5 w-5 sm:h-4 sm:w-4" />}
        </button>

        {/* 替换页标题列允许收缩，长说明截断不推动按钮或产生额外高度。 */}
        {/* 说明保留在页头内；居中弹窗仍使用原字号、段距与左右内边距。 */}
        {/* mainPage只决定几何，不参与短语数据或搜索状态的初始化。 */}
        <div className={mainPage.host ? "min-w-0 flex-1 [&>h2]:truncate [&>h2]:text-sm [&>p]:truncate [&>p]:text-[11px]" : "flex shrink-0 flex-col space-y-1.5 px-3 pb-2 text-center sm:px-6 sm:text-left"}>
          <h2
            id="quick-phrase-dialog-title"
            className="text-lg font-semibold leading-none tracking-tight"
          >
            {t("create.quickPhraseDialog.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {QUICK_PHRASE_DESCRIPTION}
          </p>
        </div>
        </div>

        <div
          className={cn(
            "shrink-0 border-b px-3 py-3 dark:border-gray-700 sm:px-6",
            THIN_BORDER_CLASS
          )}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("create.quickPhraseDialog.searchPlaceholder")}
                className={cn(
                  "flex h-8 w-full rounded-md bg-transparent py-1 pl-8 pr-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm",
                  INPUT_BORDER_CLASS
                )}
              />
            </div>

            <div className="flex items-center overflow-hidden rounded-lg border bg-background">
              <button
                type="button"
                aria-label={t("create.quickPhraseDialog.listView")}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-none px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  viewMode === "list" && "bg-muted"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("create.quickPhraseDialog.gridView")}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-none px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  viewMode === "grid" && "bg-muted"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-purple-500 px-3 text-xs font-medium text-white shadow transition-colors hover:bg-purple-600"
            >
              <Plus className="h-4 w-4" />
              {t("create.quickPhraseDialog.create")}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {filteredPhrases.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-sm">
                {t("create.quickPhraseDialog.empty")}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {t("create.quickPhraseDialog.emptyHint")}
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-3 inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-purple-500 px-3 text-xs font-medium text-white shadow transition-colors hover:bg-purple-600"
              >
                <Plus className="h-4 w-4" />
                {t("create.quickPhraseDialog.createPhrase")}
              </button>
            </div>
          ) : (
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
                  : "space-y-2"
              )}
            >
              {filteredPhrases.map((phrase) => (
                <QuickPhraseCard
                  key={phrase.id}
                  phrase={phrase}
                  onUse={handleUse}
                  onEdit={handleEdit}
                  onDelete={(item) => removePhrase(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateQuickPhraseDialog
        open={createOpen}
        onOpenChange={(nextOpen) => {
          setCreateOpen(nextOpen);
          if (!nextOpen) setEditingPhrase(null);
        }}
        editingPhrase={editingPhrase}
        onSave={handleSave}
      />
    </>, mainPage.host ?? document.body
  );
}
