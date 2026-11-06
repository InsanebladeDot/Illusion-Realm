/** 静态模板目录的适配层：48种配置与自定义素材共用同一个最小展示模型。 */
// HTML 样例只作为设计来源，产品不执行文档中的脚本。
// 轮廓已生成透明 PNG，预览与导出使用相同文件，不再维护另一套 Canvas 绘图样式。
// 资源按需读取，文字、场景说明和分类由应用原有 i18n 提供。
// 样式 PNG 没有内嵌文字，改字号或横竖排不会留下样例文字残影。
// 路径仅来自固定模板 id，不接受用户自行拼接磁盘目录。
// 自定义图片的数据地址保留在原用户文档，不随静态目录打包。
// 旧六张素材已移除，目录只由这份新配置派生。
// 如同菜单与点单分开，模板描述如何创建，图层保存用户实际点下的内容。
// 该类比对应模板对象不被修改，每次选择都创建独立的图层参数。
import catalog from "./dialogue-templates.json";
import type templateMessages from "@/i18n/locales/zh-CN/cartoon-templates.json";
import { t } from "@/i18n";
import type { DialogueLayer } from "./dialogue-types";

// 分类只允许样例已有的六类，“全部”与“自定义”属于筛选条件。
// 目录 id 对应双语词条的键，拼写错误会在构建时暴露。
// src 可用于 SVG image 和列表预览，不包含脚本或远程追踪地址。
// 自定义素材 name 可覆盖静态词条，它属于用户输入，不被翻译。
// 所有内置画片均为640×400，保留尾巴与阴影的透明边缘。
// color 和 vertical 是创建默认值，选中已有图层不会重置这些参数。
export type TemplateId = keyof typeof templateMessages;
export interface DialogueTemplate {
  id: string; category: string; src: string; color: string; vertical: boolean;
  name?: string;
}
// 此处断言仅用于本仓库固定 JSON，不把外部输入强制认作合法模板键。
// 用户自定义素材走 name 分支，不拿其 id 拼接翻译 key。
// 查询缺失返回空值，由调用方禁止生成缺图图层。
// 列表与画布共享此目录，不在两处各维护一份素材集合。
// PNG 在 Next public 下随静态导出分发，不依赖开发时的文档路径。
// 保留顶层数组身份，组件只在合并自定义素材时创建新数组。
export const DIALOGUE_TEMPLATES: DialogueTemplate[] = catalog.map(item => ({ ...item, src: `/cartoon-templates/${item.id}.png` }));
// catalog只保存轮廓默认值，不放用户编辑正文，因此更新模板目录不会覆盖已建图层。
// 每个id同时对应PNG文件和双语模板条目，三处需要保持相同拼写。
// public资源用根相对地址，在Next静态导出和app协议下仍从同一资源根解析。
// 不把docs路径写进src，用户安装包没有开发者的文档目录也能显示完整素材。
// PNG轮廓来自已确认HTML样式，卡片和作品都引用相同二进制文件。
// 这避免预览用CSS绘图、导出用另一套手写Canvas路径而出现两种不同轮廓。
// 文本未烘焙进PNG，所以修改对白不会留下图片里的旧字。
// 轮廓为640乘400画片，透明区用于容纳尾巴和阴影，不能按可见白框裁掉。
// borderless素材本来没有可见底框，其透明预览不应误报成PNG未解码。
// 图像文件只约620KB总量，不把完整参考HTML及其编译样式表嵌进应用运行时。
// 模板的font字段来自设计采样，当前文字排版仍统一用系统sans-serif兜底。
// 这个保留字段不意味着已安装或在线下载所有参考字体。
// category来自固定目录，类型故意允许string兼容用户旧素材的custom类别。
// 未来若重命名id，需要同时迁移引用；只改卡片显示名称则无需改变实例身份。
// 此目录是模块常量，消费者应通过复制新层使用，不能原地改某项text或默认色。
// 原HTML样例有伪元素尾巴，栅格资源保留其原有轮廓，包括圆角相交处的细节。
// 不能只截取白框矩形作为素材，否则尾巴和阴影会在卡片中消失。
// 参考HTML本身不是工程文件，应用不执行其中的按钮脚本或contenteditable逻辑。
// 应用文字属性重新绑定到受控层，避免把文档样例的单气泡编辑状态直接当多层编辑器。
// 参考中的样式用途作为帮助文字保留，不把参数字符串当成可执行JavaScript。
// 内置图片默认不携带用户导入背景，发布新资源不会泄漏截图中的私人作品。
// 检查borderless加载要用naturalWidth，不能用肉眼看有没有黑框判定文件存在。
// 部分样式自带旋转或发光，这些是轮廓的一部分，用户rotation再叠加整体姿态。
// 若将来改为矢量资源，需要同时检查尾巴、阴影、透明边缘与PNG导出的同源解码。
// 当前没有把48种样式重新拆成48个组件，图层始终通过共同image与text渲染。

// 默认模板的样例、用途和名称来自同一词条条目。
// 未找到自定义名称时使用其 id 保留身份，不擅自猜测它是哪种模板。
// 自定义模板没有样例正文，添加后由用户在右侧输入。
// 该方法不订阅语言，使用它的组件仍通过 useTranslation 订阅刷新。
// 文字返回普通字符串，最终由 React 转义，不作为 HTML 插入。
// 静态配置由本仓库控制，外部未知 id 不进入动态翻译索引。
export function templateText(item: DialogueTemplate, field: "name" | "sample" | "use" | "note"): string {
  // name是否存在用undefined区分，用户空名称不会被误当内置模板去读动态翻译键。
  // 自定义资源不附带sample/use/note契约，所以这三项返回空文本。
  // 不用模板id为用户文件臆造用途或对白，避免把样例当成用户原内容。
  // 内置field是联合类型，不能通过任意字符串读取整个翻译对象。
  // t在调用时读取当前语言，createDialogueLayer仅在新增时把sample写入图层。
  // 因而切换语言会更新库说明，但不会翻译或替换用户已经改写的对白。
  // 函数返回string而非ReactNode，可供SVG文本、title和普通卡片共同使用。
  // 类型断言仅解决本仓库JSON键的静态关联，不应拿来接受不可信远程目录。
  if (item.name !== undefined) return field === "name" ? item.name : "";
  return t(`dialogue.templates.${item.id as TemplateId}.${field}`);
}

// 新图层只携带模板 id，后续改字、拖动都不写回模板目录。
// 中心位置由宿主根据画布大小传入，不假设屏幕上固定的像素宽度。
// 默认宽度460让普通模板有足够可读的文字区，又不覆盖整张画布。
// 在竖版画布中也能看到左右留白，用户仍可独立调整图层宽度。
// 内置颜色跟随HTML原稿的正文对比，自定义素材采用深色文字。
// 竖排模板初始化为竖排，其余模板保留横排。
// 随机 UUID 保证同一素材添加多次可以独立选择与删除。
// 没有自动加入旧草稿，默认直接进入空白合成编辑状态。
// 透明度为整个图层，不把模板半透明背景重复乘到文字默认色上。
// 行高、字距与对齐在每层独立保存，切换选择不会互相覆盖。
// 原文使用当前语言的示例，只有创建时取一次，用户修改后保持原样。
// 旋转默认零；模板自身的轻微纸张旋转已烘焙在素材里。
// 文本字符上限由输入处统一控制，这里不擅自截断用户草稿。
export function createDialogueLayer(item: DialogueTemplate, x: number, y: number): DialogueLayer {
  // UUID由浏览器crypto创建，不以时间戳毫秒作为唯一性来源。
  // 同一帧连续选择两个相同模板仍能得到不同实例，不靠递增模块变量维持身份。
  // x和y由宿主传入当前文档中心，函数自身不读取window宽高。
  // width=460是整张画片宽度，实际白色框因透明边缘占位会比这个数字窄。
  // 字号24是作品像素，并非编辑器在窄窗口显示时的CSS字号。
  // 竖排默认仅由vertical配置决定，不能按中文显示名称包含“竖排”来猜。
  // align初始center是共同文字默认，原稿各样例的说明不构成自动业务规则。
  // color从模板读取是为了深底样式保持可读，而不是把背景自动识别成浅字或深字。
  // text在此刻取样例后就是用户文档内容，后续目录翻译更新不再回填。
  // 新对象没有src，既避免每层重复保存相同PNG地址，也使目录资源统一维护。
  // 不记录创建时刻，因为当前没有作品工程和图层时间排序的需求。
  // 本方法不会自动select，选择、历史入栈与弹窗关闭由宿主组合为一次用户意图。
  return { id: crypto.randomUUID(), templateId: item.id, x, y, width: 460,
    text: templateText(item, "sample"), fontSize: 24, lineHeight: 1.45, spacing: 0,
    direction: item.vertical ? "vertical" : "horizontal", align: "center", color: item.color,
    rotation: 0, opacity: 1 };
}
