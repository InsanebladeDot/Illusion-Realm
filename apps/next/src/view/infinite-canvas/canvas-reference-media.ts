// 画布引用只是一张当前输入的编号表，不另建上传器或视频编辑状态。
// 按实际输入槽排队：连线按工程边顺序接入，再接手动导入列表，不按名字或节点编号重排。
import { canvasFilePrefix } from "./canvas-media-name";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import type { PromptReferenceMedia } from "@/utils/prompt-media-references";
import type { CanvasData, CanvasNode } from "./canvas-model";

// 空上游也占自己的编号，稍后回填媒体时不会让后面的图片突然换号。
// 没有真实图片时只提供空地址；原引用编辑器会显示缺失提示，不伪造图片。
// 只读直接输入节点，不能把无关画布图片或下游生成结果偷偷列入引用。
// 返回的是临时展示数据，工程仍只保存原节点、边与输入图片引用。
// 候选表像排好座位的名单，空座位也保留号码，不能按已经加载的头像重新编号。
// 过滤发生在排序之前，文本和音频上游不会占用 Picture 编号。
// 节点 ID 是稳定业务身份，title 只是当前可修改的显示名称。
// 场景节点只有回写了 image 媒体才提供地址，不能把未保存的三维状态当图片。
// 直接导入使用 imported 前缀，和连线节点身份分开，移除操作不会删掉上游卡。
// 导入项顺序保留用户列表原顺序，不按文件名重排用户明确的输入顺位。
// 编号从一开始，与创作页服务提示词的 Picture 格式保持一致。
// tokenPrefix 只改变文本别名，kind 仍为 image，菜单预览继续使用原图片分支。
// buildLocalFileUrl 生成只读地址，不在名单里附带 File 或 Base64 正文。
// 没有路径保留空 src，原引用编辑器负责提示资源缺失。
// 返回值只供编辑器展示，不把临时 src 再写进持久化工程。
// 同源多个上游仍是多个明确输入，不按相同文件路径擅自去重。
// 本轮只读取直接输入，不能自动递归找祖先导致图片数量超额。
// 候选与插入后的标签均显示文件主体，不把可修改节点 title 当成真实文件名。
// displayName 只控制装饰文字，底层仍使用 Picture 编号，重名图片不会互相串图。
// 文件改名同步 media.name 后这里自然刷新，不在输入框里进行字符串全局替换。
// 手动导入和连线图片经过同一取名前缀函数，不能一处带后缀另一处不带。
// 图片和视频提示词共用这张候选表，图生图与参考生视频的标签规则保持一致。
// 当连接关系真正变化时重新计算号码，旧文本若越界由原缺失检查提示。
// 这个函数不创建边或改变输入合法性，提交仍要经过数量与媒体检查。
// 对已导入图片，文件主体优先于节点旧title，避免恢复旧工程仍显示“图片”。
// 对没有媒体的上游保留工作标题，用户还未生成结果时依然可以识别空输入位。
// 对场景节点的真实回写图片也采用媒体主体，不把未生成的场景状态伪装成图片文件。
// 当前候选表有name和displayName两个用途：前者用于搜索，后者用于已插入标签。
// 二者来自同一主体，用户搜索到的资源不会在插入后突然变成另一种名称。
// 不将后缀加入关键字搜索名，用户看到的前缀与@查询保持一致。
// 编号仍独立存在，已有@picture写法在改名后继续命中原素材。
// 下游提示词重绘只读取这份临时表，不回写上游媒体或全局模型选择。
export function canvasReferenceMedia(sources: Pick<CanvasNode, "id" | "data">[], images: CanvasData["inputImages"]): PromptReferenceMedia[] {
  const linked = sources.filter(item => item.data.kind === "image" || item.data.kind === "scene");
  const inputs = linked.map(node => ({ id: node.id, name: node.data.media?.kind === "image" ? canvasFilePrefix(node.data.media.name) : node.data.title, path: node.data.media?.kind === "image" ? node.data.media.path : "" }));
  const imported = (images ?? []).map((image, index) => ({ id: `imported-${index}`, name: canvasFilePrefix(image.name), path: image.path }));
  return [...inputs, ...imported].map((input, index) => ({ id: input.id, kind: "image", number: index + 1, tokenPrefix: "picture", displayName: input.name, name: input.name, src: buildLocalFileUrl(input.path) ?? "" }));
}
