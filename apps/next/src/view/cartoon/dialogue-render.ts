/** 气泡文字排版与图像导出：预览使用的同一棵 SVG 转为 PNG，不重新猜测画面。 */
// 图形与文字像印在同一张透明纸上，拖动、旋转时作为一个图层处理。
// 导出时复制这张纸，移除选框，再把其中的静态图片嵌入，避免离线图片丢失。
// 真实机制是 cloneNode 后序列化 SVG，再交给浏览器解码与 Canvas 编码。
// 全程在渲染侧使用浏览器能力，不读取文件路径，也不扩展 IPC。
// 字体使用系统字库或随包离线字体，不依赖外部网站加载。
// 文本由React生成节点，不拼接用户输入为XML或HTML。
// 布局函数是纯计算，服务画布预览、溢出提示和导出的共同文字几何。
import { pixelCanvas, pixelContext } from "@/utils/image-editor";
import { t } from "@/i18n";
// 分离读取器供图片和字体共用，原调用方仍可从此处读取导出保持接口稳定。
// 迁移只挪动实现，不改变超时、拒绝、事件清理和返回data URL的契约。
import { readDialogueBlob } from "./dialogue-blob";
export { readDialogueBlob } from "./dialogue-blob";
// 复制稿件时一同带上已选离线字体，Image解码不继承页面document.fonts。
// 此能力只处理白名单内置资源，不允许工程内容指定外部字体地址。
import { embedDialogueFonts } from "./dialogue-fonts";
import type { DialogueLayer } from "./dialogue-types";

// 横排把文字按字符宽度分行，竖排则每行表示一列。
// 显式换行始终保留，包括空行，不能因为 trim 丢掉用户的分段。
// 宽字符按一格，ASCII按0.6格；SVG textLength使用同一宽度，显示与换行一致。
// 这不是对自然字体的精确测量，固定字格是漫画短对白的可预期排版规则。
// 超长词可逐字换行，不让一个长英文词撑开整张画布。
// 字距可为负但输入最小为-1，计算仍保留至少一个像素的推进量。
// 文字安全区留出边框与尾巴，不把文本排到模板透明外沿。
// 不删掉超出的原文，返回 overflow 由界面提示，用户可继续修改。
// 文本限制120字，纯计算不会产生规模不受控的排版循环。
// 本函数不访问DOM，因此Next静态预渲染也能获得相同的首屏结构。
// 调宽气泡时字号保持自然像素，换算回模板坐标后重新分行。
// 这种换算像放大相框却不强迫相片里的字一起变粗，用户可以单独调字号。
// templateVertical仅决定安全区，用户仍能把该模板的文字改成横排。
// 不用css writing-mode实现一种预览、另写Canvas实现另一种导出。
// 每个字符的横竖坐标由这一份布局输出，PNG直接复用它。
export function layoutDialogue(layer: DialogueLayer, templateVertical: boolean) {
  // 先逆向换算缩放，才能独立调整框宽和作品中的字号；竖框仍使用自己的窄安全区。
  // Array.from按码点拆字，但组合符号和部分emoji不保证等于一个完整字素。
  // 横排换行限制取box.width，竖排限制取box.height，不能只交换显示方向而不换容量。
  // 行首遇到一个超宽字符时仍接收它，下一字再换行，循环必须始终消费输入。
  // 明确换行符不占推进量，空行则仍占一条行或列的位置。
  // 行尾保留空格，防止用户用空格分隔英文时被合并成另一段文字。
  // size与gap先进入相同的模板坐标单位，不能一个用自然像素一个用缩放后的数值。
  // capacity只限制渲染行，不截断layer.text，所以调整参数能够找回原文。
  // 当可见行正好等于容量时不提示overflow，多出至少一行才报告超框。
  // 一个过大的单字仍可能被clip裁切，当前overflow仅说明行数超限，不承诺字形逐像素测量。
  // 不按屏幕显示像素测字，窗口缩放不会无故增加或减少作品可见行数。
  const scale = layer.width / 640, size = layer.fontSize / scale, gap = layer.spacing / scale;
  const box = templateVertical ? { x: -60, y: -130, width: 120, height: 260 } : { x: -185, y: -90, width: 370, height: 180 };
  const vertical = layer.direction === "vertical", limit = vertical ? box.height : box.width;
  const lines: string[] = []; let line = "", advance = 0;
  for (const char of Array.from(layer.text)) {
    const width = Math.max(1, size * (vertical || !/^[\x20-\x7e]$/.test(char) ? 1 : .6) + gap);
    if (char === "\n" || advance + width > limit && line) {
      lines.push(line); line = ""; advance = 0;
    }
    if (char !== "\n") { line += char; advance += width; }
  }
  lines.push(line);
  const capacity = Math.max(1, Math.floor((vertical ? box.width : box.height) / (size * layer.lineHeight)));
  return { box, size, gap, lines: lines.slice(0, capacity), overflow: lines.length > capacity };
}

// 图片解码有明确上限，损坏图片不会让导入或导出永久显示加载中。
// 源地址只允许由本模块的导入/嵌入流程提供，不从路径字符串猜文件。
// naturalWidth与naturalHeight校验确保load事件不是空图成功。
// finish同时用于成功、失败与超时，保证一次释放全部事件。
// 解码失败清空src停止后续工作，不把上一张背景替换成坏图。
// 不创建object URL，因此这里没有需要另外回收的取件地址。
// Image对象只在当前Promise内存活，成功后由调用者绘制再释放引用。
// 清理与页面卸载独立，最长15秒就能结束，即使窗口被遮挡也有上限。
// 主动离开页面时外层会忽略迟到结果，不再写入新的UI状态。
// 报错只含操作级文案，不附加私人文件名或data URL。
// Canvas不能解码的源保持失败，不能悄悄导出一张缺背景的图片。
// PNG与JPEG、WebP都依靠浏览器真实解码，不以扩展名判断成功。
// SVG导出源不包含foreignObject，避免跨源污染Canvas导致无法取图。
// 字体只用系统字库或内嵌data URL，导出不需要外网许可或屏幕截图权限。
export function loadDialogueImage(src: string): Promise<HTMLImageElement> {
  // 在独立Image验证成功前，宿主不替换作品背景，避免先闪坏图再回退。
  // 监听安装后才写src，防止极快的data URL解码在监听存在前结束。
  // width属性可以人为配置，naturalWidth才是浏览器解码的原始像素事实。
  // 成功保留src给下一次drawImage使用，失败清src放弃继续加载无效内容。
  // 图片load与Canvas编码是不同阶段，页面能显示不等于之后toBlob必然成功。
  // 导入入口不开放任意SVG文件；此处SVG只接收应用自己序列化的受控作品。
  // 用户文字在React中转义，不能通过一句带尖括号的对白创建外部图片或脚本节点。
  // 当前没有跨域凭据设置，静态PNG和data URL都不需要携带账户Cookie。
  return new Promise((resolve, reject) => {
    const image = new Image(), timer = window.setTimeout(() => finish(false), 15000);
    function finish(ok: boolean) {
      window.clearTimeout(timer); image.onload = image.onerror = null;
      if (ok) resolve(image); else { image.src = ""; reject(new Error(t("dialogue.importError"))); }
    }
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false); image.src = src;
  });
}

// 序列化前只修改克隆节点，当前选框、焦点和图层不会被导出动作破坏。
// 外部PNG先内嵌，否则SVG作为Image解码时浏览器不会再加载其相对资源。
// 同一个模板只fetch一次，多气泡不会重复读取相同资源。
// 内置资源请求限时15秒，HTTP失败也必须中止本次导出。
// 已是data:image的背景无需重新抓取，保留用户导入的原始图像内容。
// 选框带独立标记，移除它不会删掉实际气泡轮廓或用户文字。
// width和height在根节点写入自然尺寸，忽略页面显示缩放和DPR。
// SVG内容全部来自本页受控节点，不把导入的HTML或任意工程XML塞进去。
// 无论PNG编码成功或失败，克隆节点都不挂到用户界面中。
// 导出只负责产生Blob，下载文件名和用户操作由宿主处理。
// 同时导出会由宿主busy锁阻止，这里不建立全局导出队列。
// pixelCanvas和pixelContext复用项目现有像素能力，不新写画布创建体系。
// 浏览器toBlob为空表示编码失败，不能把空值作为图片交给下载器。
// 此步骤不提示“已保存”，浏览器下载不等于用户已确认磁盘路径。
// PNG输出与预览共用SVG字格，不会遗漏透明度、旋转或竖排参数。
// 不采集用户屏幕，导出的画面不会混入标题栏、按钮或其他应用。
export async function exportDialogue(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  // 像复印当前画稿再移走选框：只修改克隆，避免导出改变用户正在编辑的界面。
  // 图片按完整地址去重后内嵌，离屏SVG不再依赖页面相对路径；白色底纸属于作品。
  // sources属于本次导出，没有全局缓存，不会长期保留上一位用户的背景字节。
  // XMLSerializer按DOM规则转义正文，禁止自行把对白插进未转义的SVG字符串。
  // MIME用image/svg+xml交给Image解码，接着才由Canvas写出PNG而不是改文件后缀。
  // 克隆的defs包含文字裁切路径，原页面卸载后快照仍是完整自包含内容。
  // 资源依次处理，避免多种模板同时fetch与解码造成不必要的瞬时并发。
  // 序列化后的SVG包含内置字体字节；系统回落仍在文字g上明确指定。
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll("[data-dialogue-selection]").forEach(node => node.remove());
  await embedDialogueFonts(copy);
  const sources = new Map<string, string>();
  for (const image of copy.querySelectorAll("image")) {
    const src = image.getAttribute("href") ?? "";
    if (src.startsWith("data:image/")) continue;
    if (!sources.has(src)) {
      const response = await fetch(src, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(t("dialogue.exportError"));
      sources.set(src, await readDialogueBlob(await response.blob()));
    }
    image.setAttribute("href", sources.get(src) ?? "");
  }
  copy.setAttribute("width", String(width)); copy.setAttribute("height", String(height));
  const data = await readDialogueBlob(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
  const image = await loadDialogueImage(data), canvas = pixelCanvas(width, height);
  pixelContext(canvas).drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("dialogue.exportError"))), "image/png"));
}
