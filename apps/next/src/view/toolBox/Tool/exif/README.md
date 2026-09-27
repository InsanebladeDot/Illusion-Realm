# EXIF 编辑器（PNG 元数据）— 模块说明

> 路由：`/toolBox/exif`（页面入口 `src/app/toolBox/exif/page.tsx`）
> 作用：读取 / 编辑 / 清除 PNG 图片中的 `tEXt` 元数据（含 ComfyUI 工作流），并支持批量重命名与批量写出到指定文件夹。

---

## 一、目录结构

```
src/view/toolBox/Tool/exif/
├── exif.tsx                 # 页面主组件：状态编排 + 流程串联（只做组合，不写算法）
├── types.ts                 # MetaItem / ProcessedFile / BatchMode 等类型
├── components/
│   ├── UploadZone.tsx       # 拖拽/点击上传 + 输入文件夹 + 输出文件夹
│   ├── MetadataEditor.tsx   # 元数据编辑器（单文件与批量共用）
│   ├── RenameConfig.tsx     # 重命名配置（单文件与批量共用）
│   ├── FileList.tsx         # 文件列表 + 状态 + 处理按钮
│   └── ForceClearModal.tsx  # 元数据不一致时的确认弹窗
└── README.md                # 本文档

src/utils/exif/              # 可复用逻辑（无 UI）
├── pngTextChunks.ts         # PNG tEXt 块解析 / 写入 / 剔除（含 CRC32）
├── metadataConsistency.ts   # 多文件元数据键集合一致性检查
├── processImage.ts          # 单图处理：应用元数据 + 重命名
├── electronFs.ts            # 选择文件夹 / 列出图片 / 读取字节 / 批量写出
└── format.ts                # 字节格式化、扩展名、重命名文件名
```

**分层原则**：`utils` 只做纯计算与 IO，`components` 只做展示与交互，`exif.tsx` 只做状态编排。

---

## 二、PNG `tEXt` 块算法（核心复杂点）

### 1. PNG 文件结构

```
[8 字节签名] + [chunk₁] + [chunk₂] + ... + [IEND]

每个 chunk = 长度(4) + 类型(4) + 数据(N) + CRC(4)
```

`tEXt` 块的数据格式为 `关键字 + 0x00 + 文本`，是 PNG 存放键值元数据的标准方式（ComfyUI 的
`prompt` / `workflow` 就写在这里）。

### 2. 三个操作（`utils/exif/pngTextChunks.ts`）

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `parsePngTextChunks(buffer)` | 解析 | 顺序扫描 chunk，仅取 `tEXt`，按 `0x00` 切分键值 |
| `stripPngTextChunks(buffer)` | 剔除 | 丢弃所有 `tEXt`，其余 chunk 原样重组 |
| `writePngTextChunks(buffer, list)` | 写入 | 先剔除旧 `tEXt`，再在 **IEND 之前**插入新块 |

### 3. 为什么必须重算 CRC

PNG 每个 chunk 尾部有 4 字节 CRC32（覆盖 `类型 + 数据`）。重组 chunk 时若不重算 CRC，
生成的 PNG 会被解码器判定为损坏。因此 `rawChunkToBytes()` 对所有 chunk 统一重算 CRC：

```
crc = crc32(type + data)   // 多项式 0xEDB88320，初值 0xFFFFFFFF，结果取反
```

> 历史实现直接拼接新 `tEXt` 且 CRC 留空，属于潜在缺陷；本次重构已修正。

### 4. 插入位置

`writePngTextChunks` 会先查找 `IEND`：

- 找到 → 在 `IEND` **之前**插入新 `tEXt`（符合 PNG 规范：`IEND` 必须是最后一个块）
- 未找到 → 追加到末尾

---

## 三、批量流程（文件夹导入 → 处理 → 批量写出）

```
选择输入文件夹 ──► IPC files:listImageFiles ──► 逐个 files:readImageDataUrl
      │                                              │
      └────────────► ProcessedFile[] ◄───────────────┘
                          │
                一致性检查（≥2 张）
                  ├─ 一致 ──► 批量元数据编辑器可用
                  └─ 不一致 ─► ForceClearModal
                                ├─ 强行统一并清空 → 清空元数据 + 切「添加字段」
                                └─ 取消保留原样   → 锁定元数据，仅允许重命名
                          │
                    点击「批量处理并保存」
                          ▼
            逐张 processImage()（写元数据 + 重命名）
                          ▼
        选择输出文件夹 ──► IPC files:saveGeneratedImages 批量写盘
        （未选择输出文件夹时回退为浏览器逐个下载）
```

### 关键设计

- **不再逐个弹下载框**：原先靠 `<a download>` 逐文件触发浏览器下载；现在一次性把整批结果
  写入用户选定的输出文件夹（`electronFs.writeFilesToFolder`）。
- **来源统一**：浏览器 `File` 与本地文件夹文件在导入时都转成
  `ProcessedFile { name, mimeType, buffer, preview }`，后续处理逻辑只有一份。
- **单文件 / 批量同构**：`MetadataEditor` 与 `RenameConfig` 两个组件同时服务两种模式，
  批量模式多出「模式切换（编辑/添加/清除）」与「排序方向」。

---

## 四、元数据语义

| 场景 | 结果 |
| --- | --- |
| 单文件 + 启用编辑 + 有字段 | 用编辑器中的字段**替换**原有 `tEXt` |
| 单文件 + 启用编辑 + 字段为空 | **清空**所有 `tEXt` |
| 批量 + 编辑现有 | 用统一字段替换所有图片的 `tEXt` |
| 批量 + 添加字段 | 同「编辑现有」语义（字段列表即最终结果） |
| 批量 + 清除全部 | 移除所有 `tEXt` |
| 元数据被锁定（不一致且选择保留） | 不触碰 `tEXt`，仅执行重命名 |

重命名规则：`前缀 + 序号 + 原扩展名`，序号按 `起始数字 ± 索引`（批量可选递增/递减，最小 1）。

---

## 五、扩展方式

- **新增元数据类型**（如 `iTXt` / `zTXt`）：在 `pngTextChunks.ts` 的 `type !== "tEXt"` 判断处扩展。
- **新增输出行为**（如导出 JSON 清单）：在 `exif.tsx` 的 `handleProcess` 写出分支追加。
- **新增批量参数**：优先放进 `utils/exif/*`，组件只负责传参。

## 六、依赖的 IPC 通道

| 通道 | 用途 |
| --- | --- |
| `dialog:selectFolder` | 选择输入 / 输出文件夹 |
| `files:listImageFiles` | 列出文件夹内图片（新增） |
| `files:readImageDataUrl` | 读取单张图片为 data URL（转 ArrayBuffer） |
| `files:saveGeneratedImages` | 批量写文件到指定文件夹 |
