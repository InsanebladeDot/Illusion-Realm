// 文件改名后修复本会话所有轻量引用，复用原 reducer 和保存模型，不复制媒体正文。
// 像图书换了书架标签，要同时修正当前借书单和历史索引，而不是只改眼前一张卡。
// 磁盘文件只有一份，多张同源卡和手动参考图都必须指向它的新地址。
// 改名本身不是可逆的磁盘事务，撤销其他编辑时不能重新带回已不存在的旧地址。
// 因此这里只重定向当前、历史、拖动快照和剪贴板，不额外塞入一笔虚假的撤销。
// 文件操作在异步入口完成，这个纯函数不调用 Node、IPC、计时器或用户文档服务。
// 原素材尺寸、类型、字节数、提示词、连线与世界坐标全部继续沿用已有值。
// 不修改传入对象，历史可能和当前文档共享未变的节点引用。
import type { RenameGeneratedImageResult } from "@/utils/generatedImages";
import type { CanvasNode } from "./canvas-model";
import type { CanvasState } from "./canvas-reducer";
import { canvasFilePrefix } from "./canvas-media-name";

// 路径来自同一受管导入器，按完整原路径匹配，不按 basename 改掉其他同名图片。
// 例如 A/Picture/人物.png 与 B/Picture/人物.png 是两份资产，不能一起更换。
// 仅新建受影响的 data；没有相关资产的节点继续保留原引用以减少重绘。
// 手动输入列表保留顺序，更新名称和地址不会把 @picture2 偷换成第一张。
// 对象展开保留未来新增的资产字段，不能只重建 path/name 而漏掉类型或大小。
// 同源卡的 title 一起同步为实际返回文件主体，不能使用尚未确认的输入草稿。
// 返回值取主进程实际文件名，非法字符经原服务处理后界面不能自说另一个名字。
// 无关提示词保持规范 token 原文，名字装饰由新的候选表重新生成。
// 匹配分为两个独立维度：节点自身的输出媒体，以及它手动上传的输入图片。
// 一个节点可能同时满足两者，例如结果仍引用自己的旧输入；两个字段都要更新。
// 节点没有输出媒体但有输入图片时，只改输入列表，不凭空给它添加一个结果。
// 节点有媒体但不是本次原文件时，必须保留它的原标题，不能统一设成新主体。
// 匹配节点的大小仍来自原media，改名不会重新探测尺寸或引入一次解码等待。
// 显式保留inputImages中的其他图片对象，已加载的无关引用不应重新挂载。
// 输入数组即使有重复路径也逐项改名，不能只修正find找到的第一处。
// 这条规则与引用编号排序无关，改名不能偷偷合并重复输入的编号。
// 节点位置与选择态通过外层展开保留；任何可见变化只能来自相关data。
// 素材路径是权限服务已确认的完整地址，不按用户输入中的斜杠拼新路径。
// result.fileName可能经过原服务的名称清理，以实际返回值作为显示的唯一来源。
// 不比较预览URL，因为URL可能编码了空格和中文，同一文件会有不同的展示形式。
// 工程保存仍只携带轻量路径，不把图片文件内容塞进每份历史快照。
function relinkNodes(nodes: CanvasNode[], result: RenameGeneratedImageResult): CanvasNode[] {
  return nodes.map(node => {
    const media = node.data.media;
    const match = media?.path === result.oldPath;
    const hasInput = node.data.inputImages?.some(image => image.path === result.oldPath);
    if (!match && !hasInput) return node;
    return { ...node, data: { ...node.data,
      ...(match && media ? { media: { ...media, path: result.filePath, name: result.fileName }, title: canvasFilePrefix(result.fileName) } : {}),
      ...(hasInput ? { inputImages: node.data.inputImages?.map(image => image.path === result.oldPath ? { ...image, path: result.filePath, name: result.fileName } : image) } : {}),
    } };
  });
}

// 历史里的删除前、复制前和拖动前文档都可能包含同一地址，不能只修正最新 nodes。
// 不清空过去与未来，否则改一个文件名就会无故丢掉用户其他可撤销的编辑。
// clipboard 是会话底稿，不参与工程保存，但下一次粘贴仍要引用存在的文件。
// drag 通常在改名前已结束，这里仍兼容非空快照，防止取消手势恢复失效路径。
// 每份文档的边和工程归属不变，不因改名改变层级、输入顺位或资产目录。
// null 代表没有剪贴板或手势，保持 null，不能创建一份空假历史。
// 显示名重定向也进入历史，撤销字号、位置时不应把标题回滚成旧文件名。
// 这里不标记保存成功；只有原用户文档写盘器确认后才能显示已保存。
// 索引示例：当前图里A与B同源，历史里A移动前的位置也引用旧文件。
// 修正后当前A、当前B和历史A均指新文件，撤销移动仍只恢复坐标。
// 索引示例：复制A后暂未粘贴，clipboard也保存着媒体描述。
// 若漏修clipboard，第一次粘贴就会创建一个找不到源文件的新节点。
// 索引示例：刚撤销删除的卡保存在future，重做时它仍可能重新进入作品。
// 因此不能只看past是否非空，future同样属于仍可访问的引用集合。
// 对每份文档单独返回新对象，不能原地改历史后让React误判没有更新。
// 未改的连线数组保持原引用，合成来源的稳定节点身份没有被重写。
// 分支函数保留泛型的其他字段，clipboard不会被错误补成完整工程。
// 返回的state仍含消息、取消标志和粘贴计数，不重置用户正在使用的会话状态。
// 当前不扫描硬盘上的其他工程文件；跨工程共享外部路径不属于本地节点重命名迁移。
// 导出的旧工程包保留包内原文件名，它有自己的媒体正文，不因当前改名被改写。
// 拖动快照引用也修正，是为了后续Escape能恢复位置同时保留有效素材。
export function relinkCanvasMedia(state: CanvasState, result: RenameGeneratedImageResult): CanvasState {
  const relink = <T extends { nodes: CanvasNode[] }>(value: T): T => ({ ...value, nodes: relinkNodes(value.nodes, result) });
  return { ...relink(state), past: state.past.map(relink), future: state.future.map(relink),
    drag: state.drag ? relink(state.drag) : null, clipboard: state.clipboard ? relink(state.clipboard) : null };
}
