export type HistoryFolder = {
  id: string;
  name: string;
  /** 用户文件夹在磁盘上的路径；「全部」无此字段 */
  dirPath?: string;
  /** 父文件夹路径；顶层文件夹为 null */
  parentDirPath?: string | null;
  /** 相对输出根目录的嵌套层数，顶层为 1 */
  depth?: number;
  /** 该目录**直接**包含的图片数；「全部」与「无此字段的来源」为 undefined */
  imageCount?: number;
  /** 目录最后修改时间（毫秒时间戳）；来源缺此字段时为 undefined */
  modifiedAt?: number;
};

export type GeneratedImageFile = {
  filePath: string;
  fileName: string;
  modifiedAt: number;
};

/**
 * `files:listOutputFolders` 的返回条目 —— **单一事实来源**。
 *
 * 主进程（`apps/electron/generatedImages.js`）用 JSDoc `import("@illusion-realm/shared")`
 * 指向这里，渲染进程（`@/utils/generatedImages`）也用它，因此「主进程少返回一个字段」
 * 或「渲染进程多消费一个字段」都会在各自的 tsc 上直接报错，而不是退化成运行期 undefined。
 */
export type OutputFolderEntry = {
  dirPath: string;
  name: string;
  parentDirPath: string | null;
  depth: number;
  modifiedAt: number;
  /** 该目录**直接**包含的图片数（与打开该目录后列出的张数同口径） */
  imageCount: number;
};
