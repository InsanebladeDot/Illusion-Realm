"use client";

import { Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "@/i18n";
import type { ExtensionCover, SelectedExtension } from "@/types/extension";
import { SelectedExtensionRow } from "./SelectedExtensionRow";

interface ExtensionDisplay { name: string; cover: ExtensionCover }
interface SelectedExtensionsProps {
  value: SelectedExtension[];
  onChange: Dispatch<SetStateAction<SelectedExtension[]>>;
  onAdd: () => void;
  disabled?: boolean;
  displays?: Record<string, ExtensionDisplay>;
}

/**
 * 已选扩展列表与添加入口共用的视图，图片和视频模式继续使用相同的数据契约。
 * value 是当前模式的已选项；这里只读取列表是否为空来选择入口外观。
 * onChange 仍交给原有 SelectedExtensionRow 使用，不在视觉改动里复制选择状态。
 * onAdd 由调用者打开原扩展选择器，因此模型系列筛选和提交规则保持原有实现。
 * disabled 继续由 fieldset 统一控制，禁用状态不会因入口改成整行按钮而失效。
 * displays 仍用于本地模型的名称与封面；没有覆盖时由行组件使用既有资源目录。
 * 空列表恢复仓库 HEAD 原版的 40px 圆形底盘与 24px 加号，不再使用放大的 60px 入口。
 * 行高由 40px 图标及上下各 12px 内边距形成，文本可以占用其余可用宽度。
 * 原版样式直接从本地 Git 对象读取对照，恢复尺寸无需下载、合并或覆盖其他文件。
 * 指南与扩展继续分区，恢复按钮尺寸不会重新挤回并排的小按钮布局。
 * 水平内边距恢复 8px、图文间隔恢复 12px，使空态入口与已有模型行保持接近密度。
 * 已选态仍使用紧凑虚线入口；本次没有恢复旧版本的业务实现或选择状态。
 * 保留新增的 focus-visible 描边，鼠标尺寸恢复不应撤销已有键盘可见性。
 * 使用 min-height 而非固定高度，语言较长或系统字号增大时允许按钮继续长高。
 * 图标 shrink-0，避免窄窗口中圆形底盘被文字挤压成椭圆。
 * 按钮占满父区域宽度，父级将指南与扩展拆成两行后不残留并排布局限制。
 * 视觉只依赖空列表状态，不根据资源是否下载决定是否显示加号。
 * 已选项不为空时使用紧凑虚线入口，避免每条扩展列表后再占一个大空白区域。
 * 紧凑入口仍为整行按钮，点击文字或其余留白都调用同一个 onAdd。
 * 已选扩展行保持原映射顺序，不因添加入口样式变化重新排序或去重。
 * 权重调节、封面、移除动作仍由 SelectedExtensionRow 负责，与选择页的草稿独立。
 * 最后一条扩展移除后，空列表入口自动恢复，不需要额外 effect 同步外观。
 * 添加按钮显式 type=button，避免被放入表单时触发生成或其他默认提交。
 * 正常文本颜色取主题语义色，不沿用固定灰色透明度，深色和浅色都有可读对比。
 * 圆形底盘使用 muted，悬停使用同一主题色，保留现有主题选择能力。
 * focus-visible 单独描边，键盘操作不依赖 hover，也不会改变按钮本身的几何宽度。
 * 图标仅传达添加动作，按钮的可访问名称来自已有的国际化“添加扩展”词条。
 * 不把截图里的资源名称或图片作为默认选择，初始内容继续来自业务状态。
 * 父组件只负责入口位置，此组件只负责空态/已选态外观，二者职责不混用。
 * 既有 fieldset 的 min-w-0 保留，避免扩展名称在窄栏中把父区域撑宽。
 * 子按钮保持 text-left，让大圆形入口与模型信息的左对齐关系清楚可见。
 * 卡片列表原有的 onWeightChange 仍使用函数式更新，多个已选项不会覆盖彼此权重。
 * 原有 onRemove 仍按 extensionId 删除，视频和图片系列互不引入额外删除规则。
 * 模型封面加载的错误回退仍交给行组件，添加入口不参与文件或网络读取。
 * 入口本身没有异步任务或持久化副作用；点击后何时提交选择由调用者决定。
 * 取消选择器不改变 value，入口继续显示之前的空态或已选态。
 * 确认选择器更新 value 后，React 在同一列表上追加行，不用重建表单编辑器。
 * 较大的图标仅用于空态按钮，不改变全局 nav 或其他工具按钮的图标尺寸。
 * 本组件不改变扩展权重的有效范围，也不对用户已经保存的数值重新归一化。
 * 对资源是否可用的校验仍留在已有生成流程，UI 不把未下载资源伪装成已准备完成。
 * 同一个 data-extension-picker-trigger 标记保留，已有冒烟和业务入口不会失去定位点。
 * 键盘焦点描边位于按钮外侧，不给圆形底盘额外添加可聚焦节点。
 * 文本与图标共同属于一个按钮，避免两个独立点击目标给同一动作产生重复 Tab 停靠。
 * 新的 span 不增加块级容器语义，按钮在辅助技术中仍保持单个清晰动作。
 * 空态与已选态复用同一个 onAdd，样式切换不会绕开原禁用条件。
 */
export function SelectedExtensions({ value, onChange, onAdd, disabled, displays }: SelectedExtensionsProps) {
  const { t } = useTranslation();
  return <fieldset disabled={disabled} className="min-w-0" data-selected-extensions>
    {/* 界面：已选扩展（LoRA）列表里的一行，图片与视频共用 */}
    {value.map((extension) => <div key={extension.extensionId} data-selected-extension={extension.extensionId}>
      <SelectedExtensionRow extensionId={extension.extensionId} weight={extension.weight} display={displays?.[extension.extensionId]}
        onWeightChange={(weight) => onChange((current) => current.map((item) => item.extensionId === extension.extensionId ? { ...item, weight } : item))}
        onRemove={() => onChange((current) => current.filter((item) => item.extensionId !== extension.extensionId))} />
    </div>)}
    <button
      type="button"
      data-extension-picker-trigger
      onClick={onAdd}
      className={value.length === 0
        ? "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-3 text-left text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        : "flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"}
    >
      <span className={value.length === 0
        ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"
        : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted"}>
        {/* 界面：「添加扩展」入口左侧的 + 图标；空列表恢复原版 24px 图形。 */}
        <Plus className={value.length === 0 ? "h-6 w-6" : "h-4 w-4"} />
      </span>
      <span className={value.length === 0 ? "text-sm font-medium" : "text-xs font-medium"}>
        {t("create.page.addExtension")}
      </span>
    </button>
  </fieldset>;
}
