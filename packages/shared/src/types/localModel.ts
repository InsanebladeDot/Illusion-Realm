export type LocalModelType = "checkpoint" | "lora" | "embedding";

export type LocalModelVersion = {
  id: string;
  name: string;
  filePath: string;
  /** 文件字节数由扫描器读取目录项后取 stat，不读取大型权重内容。 */
  /** 可选字段兼容旧用户文档，缺失时排序放末尾而不是伪造零字节。 */
  /** 同目录不同版本分别记录，不能借用目录大小代替当前模型大小。 */
  bytes?: number;
  /** 文件修改时间戳，以毫秒传输，避免本地化日期字符串参与比较。 */
  /** 不使用 Civitai 发布日期，两者代表不同事件，不能互相替代。 */
  /** 外部改动需要重新扫描；这个字段不宣称提供实时文件监视。 */
  /** 时间戳只代表本次扫描看见的修改时间，不能当成联网校验或下载完成证明。 */
  /** 不传 Date 对象，保持静态导出、preload 序列化和旧 JSON 读取都能兼容。 */
  /** 同一模型被外部覆盖后，按原扫描按钮刷新，而不依赖组件重新挂载。 */
  modifiedAt?: number;
};

export type LocalModel = {
  id: string;
  name: string;
  filePath: string;
  iconPath: string | null;
  type: LocalModelType;
  versions: LocalModelVersion[];
  /** 相对扫描根目录的第一级分类名（如 diffusion_models 下的 Anima） */
  category?: string;
};

export type LocalModelScanResult = {
  models: LocalModel[];
  scannedAt: number;
};
