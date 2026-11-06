// 把系统选择框或拖入的 File 转成已有画布节点，不读取文件正文、不上传媒体。
// 像登记书架上的书：这里只抄封面名称与存放地址，真正翻页由浏览器媒体元素完成。
// 路径只经过 preload.getPathForFile；渲染层不能依赖 File.path 或导入 Node。
// 分类先看明确扩展名，不能信任浏览器可能为空或伪造的 MIME 当作解码成功。
// 白名单只是选择范围，是否可显示和播放还要等真实 load/loadeddata/error 事件。
// 图片、视频和音频各有独立节点身份，同一文件多次导入可以形成不同创作实例。
// 不在此处去重整个作品，避免用户需要同源多实例时被悄悄丢掉选择。
import type { XYPosition } from "@xyflow/react";
import type { CanvasData, CanvasNode } from "./canvas-model";

export type CanvasMedia = NonNullable<CanvasData["media"]>;
// 直接从节点契约提取引用类型，导入工厂与保存 schema 不维护两份字段列表。
// kind 只从这个联合派生，格式表不能意外引入一种界面尚不能展示的类型。
// 非媒体节点不会出现在这个联合里，不依赖字符串强转来调用媒体标签。
export type CanvasMediaKind = CanvasMedia["kind"];
const MEDIA_EXTENSIONS = {
  // PNG/JPEG/WebP 是常见静态图片，GIF 的动画交给原生 img，不拆成节点序列。
  // AVIF 能否解码取决于随包 Chromium；允许选择并不代表所有 AVIF 编码变体可用。
  // BMP 保留给桌面工作流，SVG 暂不接入，避免把矢量文档能力混进位图导入。
  image: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"],
  // MP4、MOV、MKV 是容器名称，里面的编码可能不同，不能由后缀推断播放成功。
  // 本轮不自动转码；不支持的容器或视频编码会留下可更换的错误节点。
  // 视频没有接到时间线，选择此类文件也不会创建片段或改变旧视频编辑器工程。
  video: ["mp4", "webm", "mov", "m4v", "mkv", "avi"],
  // 音频直接使用原生 audio，不把 WAV 或 MP3 当作视频交给生成服务。
  // M4A/AAC 的编码支持同样由浏览器决定，这里不以扩展名承诺全格式兼容。
  // 不支持录音、波形采样和混音；选择已有文件不需要麦克风权限。
  audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"],
} as const;

// accept 仅限制系统选择框的默认显示，不是安全检查，也不能替代以下运行期分类。
// 三个入口用同一映射，菜单混合导入和单卡更换不会出现各自支持不同后缀的情况。
// 字符串在客户端和静态预渲染时都可计算，不依赖 window 或桌面桥接。
// 允许多选；单卡替换由调用方把第一份文件放回原卡，其余文件建立独立节点。
export function mediaAccept(kind?: CanvasMediaKind): string {
  // 指定 kind 时只列这一类，避免图片卡的更换框默认展示视频与音频。
  // 不指定时平铺全部后缀，用一个系统框完成三类媒体的混合多选。
  // 每项带点号以符合 input.accept 语法，不将裸后缀当作 MIME。
  // 保持资料顺序即可；这不是用户素材的排序，也不影响导入后的节点先后。
  return (kind ? MEDIA_EXTENSIONS[kind] : Object.values(MEDIA_EXTENSIONS).flat()).map(extension => `.${extension}`).join(",");
}

// 文件名只用来决定候选媒体类型，不从名称构造磁盘路径。
// Electron 返回的真实路径原样交给只读协议；中文、空格和多个句点都无需手工拆路径。
// 取最后一个句点后的后缀，大小写统一，video.backup.txt 不会被误认为 MP4。
// 未支持类型直接返回空，调用方逐项说明失败且保留已经存在的作品。
// browser File 无真实地址时拒绝导入，不保存刷新后必失效的临时 URL。
export function readCanvasMedia(file: File): CanvasMedia | null {
  // Windows 系统框一般给出文件基本名，但不依赖名称包含目录才能找到原文件。
  // 空文件名或没有扩展名的文件不会命中白名单；失败让调用方列出具体名称。
  // 转小写只用于分类，显示名称与磁盘路径保留原大小写。
  // 先确定类型再读取路径，返回值不携带 Electron 的内部对象或文件句柄。
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  // 例如 shot.final.PNG 会命中图片，shot.png.exe 则不会命中。
  // 浏览器对某些视频的 type 可能为空，因此不把 MIME 是否填写当作允许条件。
  // 即便内容与后缀不符也不会执行文件，只会让对应原生解码器实际尝试并报错。
  // 这种允许选择与实际读取分层，能给用户保留一张可修复的来源卡。
  const kind = (Object.keys(MEDIA_EXTENSIONS) as CanvasMediaKind[]).find(key => (MEDIA_EXTENSIONS[key] as readonly string[]).includes(extension));
  // preload 对非系统 File 可以返回 null；普通浏览器也没有这项能力。
  // 不回落到 file.name，否则相对名称会在重新打开时指向不确定目录。
  // 不执行字符串拼接、目录创建或读取文件正文，因此不会阻塞主线程搬运整个视频。
  // getPathForFile 抛错由上层逐项边界接住，不能用一个错误拖垮整批导入。
  const path = window.electronAPI?.getPathForFile?.(file);
  // size 来自系统 File，保存的只是字节数，不读取 ArrayBuffer 计算重复的文件摘要。
  // 零字节仍保留为候选引用，实际加载会明确报错，而不是被误称为取消选择。
  // 同名文件位于不同目录时路径自然不同，这里不按文件基本名错误合并。
  // 返回的是本地文件引用，不是生成结果，不生成下载地址或云端资源 ID。
  return kind && path ? { kind, path, name: file.name, size: file.size } : null;
}

// 新节点围绕当前视野排开，不能把屏幕坐标直接存成世界坐标。
// 调用方先用图引擎换算中心，这里只负责稳定的错位，缩放不会改变作品的相对距离。
// media 不包含函数、File 或 DOM，因而同一节点可以进入 schema、撤销和保存路径。
// 标题有八十字上限，但完整原文件名仍保留在媒体引用中并通过 title 展示。
// 真正的加载状态归预览组件，不在导入时声称已经解码成功。
// 创建时间只用于作品记录，不用于播放进度或伪造生成耗时。
export function createMediaNode(media: CanvasMedia, position: XYPosition, index: number): CanvasNode {
  // 新卡不沿用旧节点的 content，避免用户看到导入图片下方却显示上个文本结果。
  // 世界位置允许超出当前视口，原有“适配全部”可以看到整批卡片，不改媒体比例。
  // 工厂本身不调用镜头 API，节点数据准备可以保持可预测且无渲染副作用。
  // imported createdAt 和媒体文件修改时间含义不同，本轮只记录用户创建节点的时刻。
  // 不使用文件名作为 ID，否则同名不同目录或同源二次导入会覆盖原节点。
  // 随机身份在用户导入操作中生成，不在 reducer 重算时生成，撤销重做仍有稳定身份。
  // 只选中本批首项，避免三张卡同时挂参数面板而遮住彼此。
  // 两列排布给横向视频留出空间，第二行留出选中参数面板的高度。
  // 位置偏移用世界单位，放大镜头不会永久拉开文件之间的实际距离。
  // 复制来源对象不会复制文件字节，删除节点也不会删除该路径上的文件。
  // 提示词与手写正文默认空，不能把文件名冒充用户请求或识别出的内容。
  // 默认视频比例只描述节点参数，不对导入视频裁切、变形或重新编码。
  // 即便同一文件连续导入，身份仍独立；后续替换其中一张不会改另一张。
  // 用户可继续修改节点标题，来源名仍留在 media.name，二者不是同一个可编辑字段。
  // 多选导入是一笔作品事务，失败文件由上游筛掉，不在这里创建没有来源的占位卡。
  // 此处排布不检测旧节点占位；导入后用户仍可用已有移动能力整理重叠位置。
  return {
    id: crypto.randomUUID(), type: "canvas", selected: index === 0,
    position: { x: position.x + index % 2 * 580, y: position.y + Math.floor(index / 2) * 560 },
    data: { kind: media.kind, title: media.name.slice(0, 80), prompt: "", content: "", ratio: media.kind === "video" ? "16/9" : "1/1", createdAt: Date.now(), media },
  };
}
