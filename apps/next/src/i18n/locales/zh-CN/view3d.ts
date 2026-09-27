/**
 * 3D 视角弹窗（`view/create/view3d/**` + `utils/view3d/**`）词条。
 * 命名约定：`view3d.<语义>`，例如 `view3d.title`。
 */
export const view3d = {
  title: "3D 视角提示词生成器",
  relativeTime: {
    justNow: "刚刚",
    minutes: "{minutes} 分钟前",
    hours: "{hours} 小时前",
    days: "{days} 天前",
  },
  fullscreen: {
    hint: "F 窗口化全屏 · Shift + F 无边框全屏",
    idleHint: "左键拖拽环绕 · 滚轮缩放 · 拖入 .glb 替换模型 · {hint}",
    window: "窗口化全屏",
    windowTitle: "窗口化全屏（F）",
    borderless: "无边框全屏",
    borderlessTitle: "无边框全屏（Shift + F）",
    exit: "退出全屏",
    windowActive: "已进入窗口化全屏 · F 或 Esc 退出",
    borderlessActive: "已进入无边框全屏 · Esc 退出",
    unsupported: "当前环境不支持无边框全屏，已改用窗口化全屏",
  },
  model: {
    fit: "模型适配",
    title: "角色模型",
    builtin: "内置模特",
    pick: "选择 .glb / .gltf",
    reset: "恢复默认",
    historyPrefix: "历史模型（新→旧，",
    clearHistory: "清空",
    readFailed: "读取模型失败",
    readUnavailable: "当前环境无法读取本地模型文件",
    readFileFailed: "无法读取模型文件：{filePath}",
    unsupported: "仅支持 .glb / .gltf",
    normalized: "已归一化：高 {height}，约 {triangles} 面",
    dropHint: "拖入或选择 glb/gltf 即可替换；模型会自动缩放到约 1.8 高并脚底贴地",
    loadFailed: "模型加载失败",
    webglFailed: "当前环境不支持 WebGL，3D 预览不可用；右侧提示词仍可按角度与距离生成。",
  },
  facing: {
    title: "朝向修正",
  },
  preview: {
    title: "提示词预览（景别 + 朝向 + 视角）",
    shot: "景别（Z）：",
    toward: "朝向（X）：",
    angle: "视角（Y）：",
    level: "—（平视）",
  },
  extra: {
    title: "附加词条（可选）",
    placeholder: "例如 from side；留空则不追加",
    suggest: "建议：",
    clear: "清空",
  },
  angle: {
    azimuth: "方位角",
    elevation: "俯仰角",
    radius: "半径",
  },
  radius: {
    title: "相机距离（景别）",
    label: "相机距离",
    seriesDefault: "当前系列默认 R=",
    shotSuffix: "；景别 =",
  },
  quick: {
    title: "快捷视角",
    front: "正面视图",
    sideLeft: "正侧视（左脸）",
    sideRight: "正侧视（右脸）",
    back: "背面视图",
    highAngle: "斜俯视",
    lowAngle: "斜仰视",
    topDown: "垂直俯视",
    bottomUp: "垂直仰视",
  },
  enhance: {
    title: "增强倍率",
    resetAll: "全部重置为 1",
    sliderLabel: "{label}倍率",
    emptyTags: "（当前角度不输出该维度词条）",
    axisToward: "X 轴 · 朝向倍率",
    axisAngle: "Y 轴 · 视角倍率",
    axisAngleHint: "high angle / low angle（平视不输出）",
    axisShot: "Z 轴 · 景别倍率",
    axisTotal: "总系数",
    axisTotalHint: "对三个维度整体缩放",
    footnoteLead: "基准权重来自需求文档（如正面",
    footnoteBody: "）， 倍率 1 = 文档原值，最高 ×",
    footnoteTail: "；权重不足 1 的词条不输出",
  },
  resetView: "重置视角",
  confirmInsert: "确认并插入",
  /**
   * 高级组装模式下工具会**覆盖**「镜头视图」分类，普通模式才是插入 ——
   * 按钮文案必须跟着实际写入方式走，否则就是「文案撒谎」（用户以为追加，实际被覆盖）。
   */
  confirmOverwrite: "确认并覆盖「镜头视图」",
  confirmAppend: "确认并追加",
} as const;
