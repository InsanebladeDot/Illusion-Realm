/** 离线漫画字体：按需读取随包字体，同一份字节供预览加载和PNG内嵌。 */
// 像把字体印章带在工具箱里，预览和导出拿同一枚，不依赖用户是否装过字体。
// 文件与OFL许可放在public/dialogue-fonts，运行时只访问本应用静态资源。
// 目录中英文漫画字体不具备中文字形，标签会明确提示，中文由系统字库补位。
// Map只缓存内置字体，不包含用户正文、背景或私有文件路径。
// Promise缓存合并同一字体的并发读取，失败时删除，允许用户再次明确选择重试。
// 资源读取有15秒上限，加载失败不把选中层改成尚不可用的字体。
// loaded保存data URL的Promise，document.fonts另外拥有已经解码的FontFace。
// 因此成功后ArrayBuffer局部引用可以释放，导出使用缓存字符串而非再次下载。
// 两处缓存最多对应目录中的十项，不随气泡数量或用户输入次数增长。
import catalog from "./dialogue-fonts.json";
// 字体二进制转换复用背景导入的读取器，超时和监听清理只有一份实现。
// 读取器不判断图片类型，因此font/ttf的Blob也走相同可靠边界。
import { readDialogueBlob } from "./dialogue-blob";

// 系统字体选项保留原行为，旧图层没有fontId时不需要异步加载。
// family由固定英文id组成，不把本地化显示名写入CSS或XML。
// 导出节点保存data标记来识别所需资源，不尝试解析用户传入的font-family。
// 字体名称只是目录元数据，不作为CSS代码执行。
// 字号、换行、安全区计算继续由现有排版器负责。
export const DIALOGUE_FONTS = catalog;
const loaded = new Map<string, Promise<string>>();
// 字体文件是完整作者发行版，不按这次对白子集化，用户后来输入新字仍可使用。
// 七款中文文件的覆盖范围取决于作者字库，不把“支持中文”夸大为所有Unicode字符。
// 三款拉丁字体作为漫画对白和拟声词选择，中文字符使用同一系统fallback链。
// 文件名只承担静态资源定位，fontId才是作品层保存的稳定引用。
// 资源版权与OFL许可原文随字体放在同一目录，不只在文档中口头声明授权。
// 软件不在启动时联网更新字体，包内文件版本由构建产物固定。
// 选择器卸载不会删除已加载FontFace，否则同字体的其他气泡会突然改变字形。
// 缓存最多容纳十份资源，重复导出不为每次作品再建一个永久Map条目。
// data URL用于短期SVG中间文件，最终导出的PNG不含可编辑字体资源。
// document.fonts和loaded属于当前渲染进程，关掉软件后内存随进程释放。
// 这里不恢复旧自定义字体管理，已有用户文档的自定义字体数据仍保持不动。
// 下载资源时保存的SHA256只用于开发核验，不在用户每次点击时重新哈希大字库。
// 静态资源丢失由fetch和FontFace实际报错，不仅通过扩展名猜测是否可用。
// 类型目录由JSON推断，不使用any绕过未知资源的输入检查。
// export的字体列表从克隆中提取，所以未使用的九份文件不会全部塞入某次成品。
// 多气泡选择同一字体只保存各自id，并不让每个图层复制数MB的base64字串。
// family串包含最终fallback，预览SVG与序列化SVG必须使用完全相同的顺序。
// 返回的系统sans-serif不是目录里的一份额外字体，也不算十个内置文件之一。
// 缺fontId的旧快照与明确选择system语义相同，但不为了归一化重写旧历史。
// 配置文件可在构建期审计来源和许可，运行时不去请求字体网站的CSS。
// id判断大小写敏感，菜单提供固定id，不靠中文名字模糊匹配字体身份。
// 字体切换不会修改模板PNG，其影响范围只在当前气泡的文字g节点。
// fallback可能随操作系统字库而不同，当前不承诺生僻字跨机器逐像素一致。
export function dialogueFontFamily(id?: string) {
  return DIALOGUE_FONTS.some(font => font.id === id) ? `"Dialogue-${id}", sans-serif` : "sans-serif";
}

// 先成功装入document.fonts才通知调用方，列表不会显示已选但画布尚未加载的假状态。
// AbortSignal控制本地资源fetch；FontFace接收确定字节，加载过程不再另发网络请求。
// MIME统一为font/ttf，SVG data URL的解码不依赖app协议返回的默认类型。
// 目录白名单阻止构造任意路径，不从显示名推断文件名。
// FontFace.load的拒绝会沿Promise传给UI，由当前实例显示错误。
// 只在face.load后登记，损坏字体不会进入浏览器可用字库。
// 用引号包围family的CSS值与FontFace构造器的原始family字符串有所区别。
// family只有固定前缀与白名单id，不需要把用户内容拼入字体定义。
// 字节大小有限制，防止静态资源错误地返回一个巨大文件后继续base64转换。
// preview和export共用同一data结果，不另外生成第二套字体资源。
async function readFont(id: string): Promise<string> {
  // response.ok很重要：资源丢失时协议可能返回错误页面，不能拿HTML当字体加载。
  // arrayBuffer保留二进制字节，不能先response.text再转码，否则中文字库会损坏。
  // 大小检查在读取后执行，只约束后续复制与解码，不宣称能限制初次响应的内存峰值。
  // 先完成data URL转换再向document.fonts登记，避免Reader失败后遗留半成功状态。
  // 同一字节既生成FontFace也生成data URL，预览与导出不会各自选择不同版本资源。
  // document.fonts是浏览器的字库集合，不是应用用户文档，不写入磁盘设置。
  // 即使控件在读取途中卸载，字库成功缓存仍安全，业务提交由控件号码另行判断。
  // FontFace.load只解码传入的ArrayBuffer，不会根据字体内部名称另发远程请求。
  // 字体的OpenType内部名字可以不同于UI显示名，CSS family由构造器统一指定。
  // 文件随Next静态资源发布，在Electron中fetch走app协议，普通浏览器走同源路径。
  // 未知id在fetch之前拒绝，目录从不允许../形式的穿越路径。
  // 原始Error只在内部流转，界面最终显示操作级译文，不暴露资源路径或堆栈。
  // 字体是应用自带文件而非任意上传文件，本入口不新增解析用户自定义字体的权限。
  // 转换产生的是普通字符串，不创建blob取件地址，因此无需额外revokeObjectURL。
  const font = DIALOGUE_FONTS.find(item => item.id === id);
  if (!font) throw new Error("font");
  const response = await fetch(`/dialogue-fonts/${font.file}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("font");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error("font");
  const data = await readDialogueBlob(new Blob([bytes], { type: "font/ttf" }));
  const face = await new FontFace(`Dialogue-${id}`, bytes).load();
  document.fonts.add(face);
  return data;
}

// 失败缓存必须删除，否则第一次错误会使后续所有选择永久复用拒绝结果。
// catch重新抛出给真实操作边界，不能把失败换成系统字体后声称已应用。
// 系统默认不进此函数；未知id由readFont拒绝而非读取任意磁盘资源。
// 缓存的Promise也保存加载成功的data URL，导出无需再读取相同文件。
// 重复选择不会在document.fonts累计多份同名字体。
// 调用方取消只停止当前UI更新，不删除其他实例可能仍在使用的共享字体。
export function loadDialogueFont(id: string): Promise<string> {
  // 页面中两层同时请求相同字体时会得到同一个Promise，避免双重下载与解码。
  // 错误删除发生在拒绝传给控件之前，用户下一次明确选择可建立新请求。
  // 成功缓存和浏览器FontFace具有相同页面生命周期，应用关闭后自动释放。
  // 缓存键仅为字体id足够，因为文件路径和版本在本次静态构建中不会变化。
  // 用户正文不影响字体文件，因此不应把文字作为缓存键造成无界增长。
  // 这不是后台预加载器，调用方没有选择字体时不会运行readFont。
  let pending = loaded.get(id);
  if (!pending) {
    pending = readFont(id).catch(error => { loaded.delete(id); throw error; });
    loaded.set(id, pending);
  }
  return pending;
}

// SVG作为Image解码时不继承页面字体，因此克隆中必须自带@font-face字节。
// 像把印章连同画稿一起寄出，收件处不需要再找本机字库或外部链接。
// data标记只来自DialogueText，用户正文不会参与字体资源选择。
// Set使同款字体在十个气泡中也只内嵌一次，避免成倍膨胀SVG。
// 此函数只改导出克隆，不把大型base64样式插入可见画布。
// 字体读取失败使导出明确失败，不悄悄回落字体产生与预览不符的成品。
// style使用SVG命名空间，textContent安全写入固定模板与白名单字体数据。
// 未使用内置字体时不插style，原系统字体导出流程保持不变。
// 全部等待走Promise而非页面动画帧，窗口隐藏也能完成。
// 序列化后的data URL自包含，不依赖页面是否仍挂载字体选择控件。
export async function embedDialogueFonts(copy: SVGSVGElement): Promise<void> {
  // 克隆中的font标记来自作品当时的快照，导出等待期间切换选择不会改变这次产物。
  // 多种字体按需顺序处理，避免同时复制十份中文大字库造成瞬间额外内存峰值。
  // 系统默认没有可嵌入文件，跳过它保持浏览器原先的字体回落语义。
  // 单独SVG图像的安全环境不能请求外部字体，必须把所需资源放进同一data文档。
  // CSS规则只使用固定前缀和白名单id，JSON目录名、用户文本均不插入style内容。
  // 这里不修改text节点的位置和textLength，排版继续由已有layoutDialogue决定。
  // 字体更换只改变字形，固定字格换行策略仍保留，避免加载完成后版式跳变。
  // 完整字体文件会增加这次导出中间SVG的体积，最终PNG不包含字体字节。
  // 导出产物只保留栅格化像素，OFL许可证仍随软件字体资源分发。
  // prepend使字体规则位于图层之前，但规则作用范围仍是这个克隆SVG。
  // 原来各层自己的clipPath留在defs中，不因新增style丢失文字裁切边界。
  // 依赖资源读取失败会拒绝整次导出，页面catch负责恢复busy并显示失败。
  const ids = new Set([...copy.querySelectorAll("[data-dialogue-font]")].map(node => node.getAttribute("data-dialogue-font") ?? ""));
  const rules: string[] = [];
  for (const id of ids) {
    if (!DIALOGUE_FONTS.some(font => font.id === id)) continue;
    const data = await loadDialogueFont(id);
    rules.push(`@font-face{font-family:"Dialogue-${id}";src:url("${data}") format("truetype");}`);
  }
  if (!rules.length) return;
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = rules.join("\n");
  copy.prepend(style);
}
