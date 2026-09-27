/**
 * 跨页面组件（`components/**`）词条。
 * 命名约定：`components.<组件名>.<语义>`，例如 `components.presetShell.title`。
 */
export const components = {
  imagePreviewOverlay: {
    label: "图片预览",
    close: "关闭预览",
    previous: "上一张",
    next: "下一张",
    zoomOut: "缩小",
    zoomIn: "放大",
    resetZoom: "重置缩放",
    triggerLabel: "点击查看大图",
  },
  presetShell: {
    /** 一个 key 装下整句：中英的语序不同，拆成「前缀 + 组名 + 后缀」在英文里会读成乱序 */
    creatingFor: "为 {group} 新建预设",
    backToList: "返回预设列表",
    nameLabel: "预设名称",
    namePlaceholder: "我的自定义预设",
    create: "创建预设",
    defaultBadge: "默认",
    deleteLabel: "删除预设 {name}",
    addCustom: "添加自定义预设",
    saveChanges: "保存更改",
    /** 可选 props 的回退值（原本写在解构默认值里） */
    empty: "暂无预设",
  },
  documentDialog: {
    /** 可选 props 的回退值（原本写在解构默认值里） */
    confirm: "知道了",
  },
  resourceCoverImage: {
    empty: "无封面",
  },
  simpleNumberCombobox: {
    expandPresets: "展开预设帧率",
    recommended: "推荐",
  },
  generationNotice: {
    generating: "生成中{dots}",
    success: "图片已生成",
    failed: "生成失败",
    view: "查看图片",
  },
} as const;
