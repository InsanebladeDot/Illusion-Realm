"use client";

// 图片生成的状态适配层：尺寸解析在外层，共用选择器只接收数值和回调。
import { useCreateFormStore, type CreateFormState } from "@/stores/useCreateFormStore";
// store 只注入数据归属，不复制字段或另写参数布局；省略时仍是创建页原草稿。
// useStore 与原绑定 hook 共享同一 Zustand 订阅方式，局部实例不会反写全局。
import { useStore, type StoreApi } from "zustand";
import { CreationSizeSelector } from "./creation-size-selector";
import { createSizeSelection } from "@/utils/imageSize";
import { useTranslation } from "@/i18n";

// 原尺寸区仍是完整的受控表单，不为画布另建一套宽高和比例输入。
// mode 决定读取预设还是自定义像素，不能只靠当前 aspectRatio 表达全部状态。
// 预设宽高仍由 createSizeSelection 解析，摘要和后续执行看到相同尺寸。
// 每项 useStore 选择器读取当前实例，避免展开 details 时顺带订阅整个创建草稿。
// store 缺省时使用原绑定 hook 的 StoreApi 能力，旧调用无需改行为。
// 传入局部 store 以后所有字段必须一起切换，不能留 setSizeSelection 写向全局。
// 外部恢复更新对应状态后，同一批订阅自然刷新摘要，不另加 DOM 同步监听。
// 尺寸倍率沿用原 setSizeSelection 的处理，不在展示层乘两次。
// 自定义宽高保留为原字段的数字，摘要格式化不会成为保存值。
// 原 CreationSizeSelector 继续处理范围和错误，宿主不复制一套近似校验。
// details 收起仍保留内部控件，其值不会因反复开合重置。
// 整个侧栏关闭则卸载本组件，隐藏输入不能继续参与键盘导航。
// 该组件不读取图片的自然像素，输出意图和素材源分辨率保持独立。
// 不因选择横图比例就旋转节点媒体，也不改画布卡片位置。
// 自动回归应比对页脚快捷比例与本组件确认值，不能只检查按钮文字。
export function ImageSizeSection({ store }: { store?: StoreApi<CreateFormState> } = {}) {
  const { t } = useTranslation();
  const mode = useStore(store ?? useCreateFormStore, (state) => state.sizeMode);
  const aspectRatio = useStore(store ?? useCreateFormStore, (state) => state.aspectRatio);
  const customWidth = useStore(store ?? useCreateFormStore, (state) => state.customWidth);
  const customHeight = useStore(store ?? useCreateFormStore, (state) => state.customHeight);
  const scale = useStore(store ?? useCreateFormStore, (state) => state.sizeScale);
  const onChange = useStore(store ?? useCreateFormStore, (state) => state.setSizeSelection);
  const value = { mode, aspectRatio, customWidth, customHeight, scale };
  const dimensions = createSizeSelection(value);
  return (
    /* 界面：「图片尺寸」，保留原有桌面布局及图片尺寸约束 */
    <details data-create-size className="rounded-xl border border-border p-3">
      <summary className="flex min-h-8 cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
        <span>{t("create.imageSizeSection.title")}</span>
        <span data-size-summary className="font-medium tabular-nums">{dimensions.width} × {dimensions.height}</span>
        <span className="text-xs text-muted-foreground">{t("create.workspace.expandSettings")}</span>
      </summary>
      <CreationSizeSelector className="pt-3" value={value} onChange={onChange} />
    </details>
  );
}
