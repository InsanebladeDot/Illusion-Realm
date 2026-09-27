/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const promptAssembly = {
  "title": "提示词组装",
  "editor": {
    "label": "提示词",
    "helpLabel": "提示词说明",
    "autocomplete": "自动补全",
    "advanced": "高级",
    "assemble": "组装",
    "assembleTitle": "提示词组装（分类 Tab + 模板，显示在右侧面板）",
    "phrases": "片段",
    "createPhrase": "创建片段",
    "collapsedHint": "提示词已收起，点击展开",
    "placeholder": "描述你想创作的内容...",
    "placeholderAdvanced": "高级组装模式：内容由右侧「提示词组装」的分类自动拼接"
  },
  "filled": "已填",
  "close": {
    "title": "返回图库（关闭高级组装）",
    "inlineTitle": "收起组装面板",
    "back": "返回图库",
    "collapse": "收起"
  },
  "tab": {
    "fallback": "分类",
    "contentSuffix": "内容（支持多行）",
    "inputLabel": "{label}内容",
    "placeholder": "在此填写「{label}」，留空则不会参与拼接…",
    "removeLabel": "删除分类 {label}"
  },
  "tools": {
    "painter": "画师",
    "character": "角色",
    "characterTitle": "角色库（选择角色并导入提示词）",
    "characterToolTitle": "打开角色库，确认后写入「角色」",
    "pose": "动作库",
    "poseTitle": "动作库（选择动作 Tags，写入「姿势」）",
    "poseToolTitle": "打开动作库，确认后覆盖「姿势」",
    "background": "背景库",
    "backgroundTitle": "背景库（选择背景 Tags，写入「背景」）",
    "backgroundToolTitle": "打开背景库，确认后覆盖「背景」",
    "expression": "Expression Library",
    "expressionTitle": "Expression library (pick expression tags, writes into “Expression”)",
    "expressionToolTitle": "Open the expression library; confirming overwrites the “Expression” category",
    "view3d": "3D 视角",
    "view3dTitle": "打开 3D 视角生成器，确认后写入「镜头视图」",
    "coverPrefix": "确认后直接覆盖「",
    "coverSuffix": "」（普通模式下为插入）",
    "coveredShot": "已覆盖「镜头视图」分类",
    "coveredCharacter": "已覆盖「角色」分类",
    "coveredPose": "已覆盖「姿势」分类",
    "coveredBackground": "已覆盖「背景」分类",
    "coveredExpression": "Overwrote the “Expression” category",
    "coveredCustom": "Written into the “{label}” category"
  },
  "quickWords": {
    "title": "快捷插入词（点击追加到当前分类）",
    "edit": "编辑快捷词",
    "doneEditing": "完成编辑快捷词",
    "inputPlaceholder": "新增快捷词后回车",
    "removeLabel": "移除快捷词 {word}"
  },
  "customTab": {
    "titlePrefix": "自定义分类（如 光效 / 色彩，最多",
    "titleSuffix": "个）",
    "placeholder": "新分类名称",
    "add": "新增分类",
    "nameRequired": "请输入分类名称",
    "limit": "分类最多 {max} 个",
    "added": "已新增分类「{label}」",
    "toolsLabel": "Tools for this category:",
    "toolsEmpty": "No tools attached yet — pick one or more below and you can call them right from this category."
  },
  "template": {
    "title": "模板（保存当前所有分类的填写状态）",
    "namePlaceholder": "模板名称，如 SDXL 完美人像模板",
    "save": "保存为模板",
    "selectLabel": "选择模板",
    "selectPlaceholder": "选择模板…",
    "load": "加载",
    "fallbackName": "模板",
    "nameRequired": "请输入模板名称",
    "saved": "已保存模板「{name}」",
    "loaded": "已加载模板「{name}」",
    "deleted": "已删除模板",
    "empty": "还没有模板，填好分类后点「保存为模板」即可复用"
  },
  "merged": {
    "title": "合并预览（逗号自动拼接，只读）",
    "allEmpty": "（各分类都为空）",
    "empty": "还没有可复制的提示词",
    "copied": "已复制合并后的提示词"
  }
} as const;
