/**
 * 通用词条：跨页面复用的界面动作与提示。
 * 只登记**当前真的被用到**的词；需要新词时再加，不要预先堆一批没人用的。
 */
export const common = {
  cancel: "取消",
  save: "保存",
  delete: "删除",
  copy: "复制",
  close: "关闭",
  loading: "加载中…",
  notImplemented: "{label} 暂未开发",
  copyFailed: "复制失败",
  /**
   * 语言的**自称**（每个语言用自身文字写自己的名字）。
   * 语言切换弹框直接读这个键，因此新增语言时不必在别处再维护一张「语言名」表；
   * 值刻意不翻译（English 在任何语言下都显示 English）。
   */
  localeNameSelf: "简体中文",
} as const;
