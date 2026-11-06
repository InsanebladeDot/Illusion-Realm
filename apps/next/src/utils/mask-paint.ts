/**
 * 原像素画笔和选区算法，供蒙版和 RGB 图层复用。
 * 画笔先生成带软边的印章，再按路径距离插值，速度不改变笔触密度。
 * 选色依据可见合成图的 RGB，容差使用单通道最大差值，范围 0–255。
 */
import { maskCanvas, maskContext, type MaskDocument } from './mask-document';

// draw 固定作用于蒙版，paint 固定作用于绘画层；erase/fill 使用当前层。
// select 从原图加绘画的颜色计算蒙版，不改原图或绘画像素。
// pan 只移动视图，不创建任何撤销记录或输出数据。
// 工具枚举用于事件分派和界面选中状态，不依赖中文标签字符串。
// 原图永远不是绘制目标，切换工具只能改变 mask 或 painted。
// 填充与全局选色共用颜色判据，区域范围由 contiguous 明确区分。
// 画笔压力尚未参与参数，opacity 是用户设置的固定强度。
// 三种选区工具统一产出自然坐标选区，select 仍保留原来的选色蒙版能力。
// crop 是唯一裁剪入口，不按形状重复提供多个裁剪按钮。
// 查看工具和画像素工具继续沿用同一指针分派。
export type MaskTool = 'draw' | 'paint' | 'erase' | 'fill' | 'select' | 'pan' | 'rectangle' | 'ellipse' | 'lasso' | 'crop' | 'blur';
// 点坐标允许小数，缩放后鼠标位置仍映射回准确自然像素。
// 实际填充取整到像素，笔刷中心则保留小数以避免低倍率跳动。
export interface MaskPoint { x: number; y: number }
// size 是直径或方形边长，单位为原图像素，不受屏幕缩放影响。
// opacity 控制覆盖强度，hardness 控制实心中心与软边宽度。
// spacing 是直径比例，0.1 表示每十分之一直径盖一次印章。
// displayOpacity 在 UI 层单独管理，不属于实际画笔参数。
// 圆与方只改变印章形状，不改变中心坐标或 spacing 的单位。
// 笔刷 opacity 用0到1强度，最终转成8bit alpha时才取整。
// hardness=1没有渐变环，hardness=0从中心开始线性衰减。
// spacing 以直径比例计，不能传入当前屏幕上的像素距离。
// 工作区表单负责值域，底层不通过散落默认值悄悄修正用户参数。
// 颜色字段是六位RGB，蒙版路径忽略这个颜色而始终输出白RGB。
// 蒙版显示色另由预览器使用，修改它不创建内容历史。
// 输入设备压力、倾斜和流量尚未接入，不将普通透明度宣称为压感。
export interface MaskBrush { size: number; opacity: number; hardness: number; spacing: number; shape: 'circle' | 'square'; color: string }
// 默认实心圆笔保持旧蒙版涂抹的二值语义，软边由用户主动启用。
// 初始颜色只用于新增 RGB 绘画，蒙版叠加色由工作区独立保存。
// 重置复制该对象，不能修改模块常量导致下一次新文档默认值漂移。
export const DEFAULT_MASK_BRUSH: MaskBrush = { size: 40, opacity: 1, hardness: 1, spacing: 0.1, shape: 'circle', color: '#ff5577' };

/**
 * 像素印章统一实现圆形和方形软边，不依赖 SVG 描边的硬边限制。
 * 最大通道距离产生方形轮廓，欧氏距离产生圆形轮廓。
 * 颜色仅用于 RGB 绘画，蒙版统一使用白色 RGB。
 * alpha 包含笔刷不透明度；硬度为一时边缘保持完全实心。
 * 每笔只构造一次印章，移动事件复用，不反复分配像素缓冲。
 * 半像素采样按像素中心计算，奇数和偶数大小均围绕光标中心。
 */
export function brushStamp(brush: MaskBrush, mask: boolean): HTMLCanvasElement {
  // ceil 为非整数直径提供足够画布，但 UI 当前使用一像素步长。
  // 颜色通道按 R/G/B 两位解析，入口只接受六位十六进制字符串。
  // 蒙版印章使用白色避免以后读取 RGB 时误把显示颜色当成覆盖率。
  // 零 alpha 的印章仍有 RGB，后续 Canvas 合成只取其有效透明贡献。
  const size = Math.max(1, Math.ceil(brush.size)), canvas = maskCanvas(size, size), context = maskContext(canvas), pixels = context.createImageData(size, size);
  const rgb = mask ? [255, 255, 255] : [1, 3, 5].map(start => parseInt(brush.color.slice(start, start + 2), 16));
  // 内部距离已归一到半径一，圆形与方形共享硬度计算公式。
  // hardness=0 从中心向边缘线性衰减，hardness=1 没有渐变区。
  // strength 在轮廓外直接为零，方形角不会错误地变成圆角。
  // alpha 最后一次取整到 8bit，预览与输出读取相同精度。
  // 同一笔复用印章可以减少鼠标事件处理中创建 ImageData 的次数。
  // UI 限制最大 256，印章循环规模可控，不以整张图尺寸计算每个点。
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = Math.abs((x + 0.5) * 2 / size - 1), dy = Math.abs((y + 0.5) * 2 / size - 1), distance = brush.shape === 'circle' ? Math.hypot(dx, dy) : Math.max(dx, dy);
    const strength = distance > 1 ? 0 : brush.hardness >= 1 || distance <= brush.hardness ? 1 : (1 - distance) / (1 - brush.hardness), i = (y * size + x) * 4;
    pixels.data.set([...rgb, Math.round(255 * strength * brush.opacity)], i);
  }
  context.putImageData(pixels, 0, 0); return canvas;
}

/**
 * 保留上次印章位置并按固定距离前进，稀疏鼠标事件仍能形成连续线。
 * 返回最后实际落笔位置，下一事件继续累计尚不足一步的路径距离。
 * 擦除使用 destination-out，软边按同样强度减少覆盖率。
 * 合成状态只存在 save/restore 范围内，不污染随后绘制和导出。
 * 初次落笔由调用方传相同起终点，单击也能产生一个印章。
 * pan 和选择类工具不会调用此函数，避免把点击填充错误画成点。
 */
export function paintSegment(canvas: HTMLCanvasElement, stamp: HTMLCanvasElement, from: MaskPoint, to: MaskPoint, spacing: number, erase: boolean): MaskPoint {
  // spacing 相对实际印章宽度计算，改变笔刷大小后自动保持相同密度比例。
  // 最小半像素间距防止极小笔刷产生接近零的循环步长。
  // distance 由欧氏长度决定，斜线不会比横线少盖印章。
  // 长路径逐步补点而不是只画两个端点，高速移动也能形成连贯笔迹。
  // 当前算法沿事件折线插值，极快的曲线仍受输入事件采样精度限制。
  // save/restore 包围合成设置，即使上一工具是擦除，下次绘制也恢复正常。
  const context = maskContext(canvas), distance = Math.hypot(to.x - from.x, to.y - from.y), step = Math.max(0.5, stamp.width * spacing);
  context.save(); context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  // last 是最后实际盖章点，尚不足一步的移动留到下一次处理。
  // down 使用零距离触发首个印章；move/up 需先过滤同位置事件。
  // 否则低透明度单击会叠加两次，这种错误必须用像素断言捕捉。
  // 返回点不代表实际鼠标终点，调用方不要把尚未落笔的终点覆盖回去。
  let last = from;
  if (!distance) context.drawImage(stamp, to.x - stamp.width / 2, to.y - stamp.height / 2);
  for (let offset = step; offset <= distance; offset += step) { last = { x: from.x + (to.x - from.x) * offset / distance, y: from.y + (to.y - from.y) * offset / distance }; context.drawImage(stamp, last.x - stamp.width / 2, last.y - stamp.height / 2); }
  context.restore(); return last;
}

/**
 * 颜色选择可全图匹配或仅匹配四邻域连通区域，油漆桶始终连通。
 * 队列和访问位按像素数一次分配，每个像素最多入队一次。
 * 选区颜色取原图与绘画的真实合成，不把蒙版显示色混进匹配。
 * 蒙版填充保留白色 RGB，绘画填充使用当前画笔颜色和强度。
 * 点击画布外不会夹取边缘触发误填；调用前仍应完成坐标换算。
 * 同一点击是一个历史操作，调用方先记录快照再进入算法。
 * 选色模式按当前 opacity 添加覆盖，不清空已存在的其他选区。
 * 合成颜色使用逐像素 source-over，透明绘画不会把原图弄黑。
 */
// 输出颜色依据点击时的 RGB 合成，蒙版叠加提示色不构成区域边界。
// 区域容差逐通道比较，不采用感知色差或智能主体分割。
// 连通模式只能经过四邻域，斜角接触的区域不会因此自动连在一起。
// 非连通模式会选择全图所有相近颜色，用户需明确选择该范围。
// 蒙版桶对已覆盖起点采用移除模式，恢复使用同一整笔历史记录。
// 移除只改变覆盖率，不从原图删除对象，也不修改 painted 颜色。
// RGB 桶不复用这个反选语义，以免第二次点击意外清空绘画像素。
// seen 和 queue 按文档像素数分配，大尺寸操作仍有同步内存与耗时成本。
// 每个位置最多入队一次，防止区域较大时重复扩展指数增长。
// 数组索引与自然宽高绑定，当前显示缩放不参与邻域运算。
// 画布外起点直接拒绝，不能因 pointer capture 把外部点夹到边缘触发填充。
// 历史由调用者创建，函数本身不会在每个像素上记录撤销。
// 写回在区域扫描完成后发生，匹配输入不受本次填色污染。
// 半透明RGB采用 source-over 方程，重叠结果不被简单赋值破坏。
export function fillMaskRegion(doc: MaskDocument, point: MaskPoint, layer: 'mask' | 'painted', brush: MaskBrush, tolerance: number, contiguous: boolean, toggle = false): void {
  // 点在画布之外直接退出，避免 pointer capture 外部点击被夹到图边。
  // width×height 是本地数组容量，不额外扩展到 CSS 显示尺寸。
  // sample 只在这次操作开始时读取，填色不会改变后续区域匹配依据。
  // 这样填充不会一边染色一边把自己的新颜色当成新的边界。
  // 容差采用每通道最大偏差，不使用亮度替代颜色差异。
  // 因此相同亮度的红绿区域仍能通过颜色选择区分。
  const { width, height } = doc.original, x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const combined = maskCanvas(width, height), context = maskContext(combined); context.drawImage(doc.original, 0, 0); context.drawImage(doc.painted, 0, 0);
  const sample = context.getImageData(0, 0, width, height).data, start = y * width + x, target = maskContext(doc[layer]), output = target.getImageData(0, 0, width, height);
  const color = layer === 'mask' ? [255, 255, 255] : [1, 3, 5].map(offset => parseInt(brush.color.slice(offset, offset + 2), 16));
  const matches = (index: number) => [0, 1, 2].every(channel => Math.abs(sample[index * 4 + channel] - sample[start * 4 + channel]) <= tolerance);
  // 油漆桶点击已有覆盖的蒙版区域时移除该颜色区域的覆盖。
  // 颜色选择模式不启用 toggle，连续选择可以继续添加而不是意外反选。
  // RGB 填色也不启用移除，擦除由单独工具负责。
  // output 是操作前快照，决定移除还是添加只看最初点击像素。
  const removing = toggle && layer === 'mask' && output.data[start * 4 + 3] > 0;
  // source-over 使用归一 alpha 计算 RGB，不能直接覆盖半透明颜色。
  // alpha 为零时 RGB 清零，避免除零导致 NaN 进入像素数组。
  // 蒙版两次颜色选择也遵循强度叠加，软边覆盖不会被硬编码成全白。
  // 只是预览色变化不会进入这个函数，原图本身也没有可写引用。
  const paint = (index: number) => { const i = index * 4; if (removing) { output.data[i + 3] = 0; return; } const old = output.data[i + 3] / 255, alpha = brush.opacity + old * (1 - brush.opacity); for (let c = 0; c < 3; c++) output.data[i + c] = alpha ? (color[c] * brush.opacity + output.data[i + c] * old * (1 - brush.opacity)) / alpha : 0; output.data[i + 3] = alpha * 255; };
  // 非连通选色遍历全图；连通填充则只扩展四个正交邻居。
  // 横向邻居单独检查列号，避免每行最后一个像素连接到下一行开头。
  // seen 在入队时设置，多个邻居同时访问同一像素也只排队一次。
  // 不匹配的边界像素标记后停止扩展，不会穿过不同颜色到达另一块区域。
  // 队列最多 width×height 项，不使用递归，大片区域不会导致调用栈溢出。
  // 算法目前同步执行；高分辨率全图选色可能短暂占用渲染线程。
  // 这是性能边界而非后台任务，错误由工作区 action 的 try/catch 处理。
  if (!contiguous) { for (let i = 0; i < width * height; i++) if (matches(i)) paint(i); }
  else {
    const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height); let head = 0, tail = 1; queue[0] = start; seen[start] = 1;
    while (head < tail) { const i = queue[head++]; if (!matches(i)) continue; paint(i); const neighbors = [i - width, i + width]; if (i % width) neighbors.push(i - 1); if (i % width < width - 1) neighbors.push(i + 1); for (const next of neighbors) if (next >= 0 && next < seen.length && !seen[next]) { seen[next] = 1; queue[tail++] = next; } }
  }
  target.putImageData(output, 0, 0);
}

/**
 * 蒙版反转只改变覆盖率，与 Canny 黑白反转是独立操作。
 * 全透明像素变全覆盖，中间灰度取补值，RGB 统一恢复白色。
 * 几何变换同步处理三层，并使用整数像素映射避免插值模糊。
 * clockwise 交换宽高；镜像保持尺寸，撤销快照记录旧尺寸。
 * 只读取临时副本后再调整目标宽高，避免 resize 把源内容清空。
 * 保存时使用变换后的自然尺寸，UI 缩放比例由画布重新计算。
 */
export function invertMask(doc: MaskDocument): void {
  // 覆盖率取反后保留所有灰度级，软边不会退化成硬选区。
  // 原图与绘画层完全不参与此操作，因此蒙版反转不会修改颜色。
  // 调用方记一次历史，连续反转两次应逐字节回到原覆盖率。
  // putImageData 绕过当前合成状态，保证反转是替换而不是累加。
  const context = maskContext(doc.mask), pixels = context.getImageData(0, 0, doc.mask.width, doc.mask.height);
  for (let i = 0; i < pixels.data.length; i += 4) { pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255; pixels.data[i + 3] = 255 - pixels.data[i + 3]; }
  context.putImageData(pixels, 0, 0);
}
// 旋转与镜像同时修改原图、绘画和蒙版，三层始终维持相同方向。
// 自然尺寸变化后显示器重新计算适应比例，不改变图片实际像素密度。
// 套索与裁剪预览属于旧坐标系，宿主执行后应清空两者。
// 原始 File 不被重写，源图片元数据仍供模型快捷加载使用。
// 旋转后工作流提交读取变换后的原图层，而不是重新读取 File 的旧像素。
// 同一操作前的快照包含旧宽高，撤销不是再转一个近似角度。
// 这里没有任意角度旋转插值，90度和镜像都保持整数像素对应。
export function transformMask(doc: MaskDocument, mode: 'rotate' | 'flipX' | 'flipY'): void {
  // 三层逐个使用同尺寸副本，复制完成后才改变原 canvas 尺寸。
  // 旋转是 90 度整数变换，不存在任意角旋转的重采样和空白边界问题。
  // 原图和蒙版必须同方向、同偏移，不能只转显示层留下错位的生成输入。
  // transform 结束恢复单位矩阵，后续画笔坐标仍然是自然像素。
  // 镜像两次应恢复内容，回归读取不对称笔迹的对应像素验证。
  // 逆时针由上层三个顺时针操作组成，但只记录一次撤销历史。
  for (const canvas of [doc.original, doc.painted, doc.mask]) {
    const { width, height } = canvas, copy = maskCanvas(width, height); maskContext(copy).drawImage(canvas, 0, 0);
    canvas.width = mode === 'rotate' ? height : width; canvas.height = mode === 'rotate' ? width : height; const context = maskContext(canvas);
    if (mode === 'rotate') { context.translate(height, 0); context.rotate(Math.PI / 2); }
    else { context.translate(mode === 'flipX' ? width : 0, mode === 'flipY' ? height : 0); context.scale(mode === 'flipX' ? -1 : 1, mode === 'flipY' ? -1 : 1); }
    context.drawImage(copy, 0, 0); context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
