"use client";

import type { ReactNode } from "react";

/**
 * 帖子与收藏作品共用的展示卡片，不负责获取数据或修改收藏状态。
 * id 与 kind 只标识调用方的作品，不推断云端资源 ID 或账户归属。
 * image 使用调用方已解析的图片地址；样例传打包素材，真实资源自行鉴权。
 * title 同时用作图片替代文本和查看按钮名称，标题仍由调用方国际化。
 * category 只显示已翻译的分类名，不把模型类别当成作品类别。
 * coverAction 位于封面按钮的兄弟节点，收藏操作不会触发图片详情。
 * headingAction 用于帖子菜单；没有菜单时不制造空白按钮或焦点。
 * description 支持摘要或标签，同一文字区域继续遵守既有卡片比例。
 * footer 接收独立的互动按钮，避免嵌套按钮与整卡点击抢占事件。
 * onOpen 只通知宿主选择作品；详情、权限和写入失败处理仍归宿主。
 * 公共 pr-post 样式负责圆角、封面比例和压缩，两个入口不再复制卡片骨架。
 * 图片继续延迟加载；原始资源没有缩放或重新编码，详情可使用同一地址。
 * kind 对应的 data 属性保留专项检查入口，共用标记用于核对组件复用。
 * 可选插槽为空时由 React 省略，不改变封面与正文的两行栅格结构。
 * 标题菜单只在存在插槽时参与布局，收藏卡因此保留完整标题宽度。
 * 封面外层最小尺寸由共用样式归零，图片自然高度不能反向撑开卡片。
 * 两类卡片统一横向矩形比例，筛选剩一项时也不依赖内容数量决定卡宽。
 */
interface ProfileArtworkCardProps {
  id: number; kind: "post" | "collection"; image: string; title: string; category: string;
  description: ReactNode; footer: ReactNode; onOpen: () => void;
  coverAction?: ReactNode; headingAction?: ReactNode;
}

/**
 * 界面：作品卡片；封面、标题和互动区共享几何但保留各自操作。
 * 封面外包一层定位容器，使右上角收藏按钮能保持完整命中区域。
 * 类别仍在图片左下，覆盖按钮单独定位在右上，二者互不遮挡。
 * 查看图片和查看标题调用同一回调，键盘用户无需依赖图片点击。
 * data-profile-post 保持原来的帖子选择器，收藏卡不会混进帖子统计。
 * 公共卡片不生成作者、日期或赞数，避免在真实内容中混入样例字段。
 * 正文节点先渲染摘要再渲染 footer，现有自适应和底部对齐规则继续生效。
 * 插槽必须由调用方传按钮等语义元素，本组件不为未知操作添加包装按钮。
 * 无整卡 click handler，因此取消收藏不会同时打开已被移除的作品。
 * 传入文本作为 React 节点处理，不使用 HTML 字符串或危险解析。
 * className 仅由固定 kind 生成，不接收未经校验的资源数据作为样式。
 * 组件自身无状态，筛选和标签切换后的状态由上层同一数据源保持。
 * 图片尺寸由容器限制，长标题沿用正文的两行截断与详情入口。
 * 外部状态更新只替换插槽内容，不额外重挂图片或打开新的详情实例。
 */
export function ProfileArtworkCard({ id, kind, image, title, category, description, footer, onOpen, coverAction, headingAction }: ProfileArtworkCardProps) {
  return <article className={`pr-post pr-artwork-${kind}`} data-profile-artwork={kind} data-profile-post={kind === "post" ? id : undefined} data-profile-collection={kind === "collection" ? id : undefined}>
    <div className="pr-artwork-cover"><button type="button" className="pr-post-cover" onClick={onOpen} aria-label={title}><img src={image} alt={title} loading="lazy" /><span>{category}</span></button>{coverAction}</div>
    <div className="pr-post-copy"><div className="pr-post-heading"><button type="button" onClick={onOpen}>{title}</button>{headingAction}</div><p>{description}</p><footer>{footer}</footer></div>
  </article>;
}
