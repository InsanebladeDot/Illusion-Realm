/**
 * 为本地 SHA256 补全收集同一版本的封面候选，兼容接口缺字段与内容偏好。
 * 只返回经过下载白名单验证的地址；真正下载、解码和落盘仍由原下载器完成。
 * 版本列表像同一本书的不同版次，只能借当前版的插图，不能拿其他版冒充。
 * 本模块仅修正“哪些图片可尝试”，不决定模型是否匹配或是否已经补全。
 * 哈希与父模型 ID 仍由 hash-lookup 核验，不能凭封面相似就认作同一模型。
 * 返回多个候选只存在主进程内，不把整个远程响应塞入持久化来源 JSON。
 * 单张 previewUrl 仍保留供已有详情读取，避免要求旧消费者迁移字段。
 * 内容偏好每次收集时读取，用户确认设置后重试无需重启整个客户端。
 * 图片来源没有新增域名，继续受现有下载器的 HTTPS 主机限制保护。
 * 在线浏览与主进程不能共用依赖 React/i18n 的渲染模块，因此这里保留纯数据适配。
 * 新增图片格式时要同时核对 Electron 解码能力，不能只给后缀正则增加一个名字。
 * 对不可解码格式的最终失败由恢复器报告 coverFailed，本模块不把它谎报为下载成功。
 * 主机白名单只解决请求目的地，来源文件的作者说明不会被用作图片下载地址。
 * 图片数量有限不代表 API JSON 可以无限读取，原查询器的二 MiB 上限继续生效。
 * 本模块不信任远端文件大小声明，也不根据 sizeKB 预先分配封面缓冲。
 * 内容设置控制的是本机请求策略，无法替代站点账号权限或保证私有图片可访问。
 * CDN 返回登录页时仍由下载和解码校验拒绝，不会把网页截图当成模型封面。
 * 调用方收到空列表时仍可先保存来源，后续用户调整设置后重新查询即可补图。
 * 无需将用户已有模型移动到下载器默认目录，封面继续保存在原授权模型文件夹。
 */
const { readUserData } = require("../../storage/user-data");
const { allowedUrl } = require("../models/downloads/model-download-network");

/**
 * 用户文档是外部输入，先缩窄再读字段，坏值不能让整个补全失败。
 * 这里不把数组当对象，因此异常的设置或图片条目会自然回落为空。
 * 不能使用字符串强转，否则 null、数组或数字会被误读成有效配置。
 * 只需要读取一层字段，不对远程对象做合并，也不调用其方法。
 * 空对象不代表接口成功，上层仍负责验证必需的模型身份信息。
 * @param {unknown} value 用户文档或远端数组中尚未校验的单个值。
 * @returns {Record<string, unknown>} 可逐字段缩窄的记录，非对象回落为空记录。
 */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * 沿用 C站页面的已确认内容偏好，不在 SHA256 入口另设永远关闭的开关。
 * enabled 单独为 true 不足以通过，须有当前协议版本和有效确认时间。
 * 这与 shared/types/content-access.ts 的 resolveCivitaiContentAccess 等价。
 * 协议版本改变时两处必须同步，回归同时检查缺确认、旧版本和非法时间。
 * 不读取 API Key，内容偏好与下载鉴权是两种不同的配置。
 * 文档不存在时按默认关闭处理，正常的公开图片依然可以补全。
 * 只读取配置，不改变用户选择或自动替用户接受协议。
 * 缺少 settings 与缺少 civitaiContentAccess 都属于首次使用的正常情况。
 * 读取的是应用已有用户文档，不另建配置文件或浏览器存储副本。
 * 时间必须是正的有限数字，NaN、Infinity 和字符串均不能算确认记录。
 * 不要求确认时间早于现在，沿用 shared 规则，避免机器时钟差造成分歧。
 * 不根据网站 cookie 推测授权，本地页面开关才是此次补图使用的偏好。
 * 关闭偏好只限制候选图片，不阻止哈希查询或作者、触发词等文字补全。
 */
function contentAccessEnabled() {
  const access = record(record(readUserData().data?.settings).civitaiContentAccess);
  return access.enabled === true && access.agreementVersion === 1 && typeof access.acceptedAt === "number" && Number.isFinite(access.acceptedAt) && access.acceptedAt > 0;
}

/**
 * 当前内容偏好关闭时，过滤明确标记的受限图片，与在线搜索使用同一规则。
 * 旧接口没有 nsfwLevel 或返回 0 时不再误判为“没有预览图”。
 * 未知等级不擅自转换字符串，兼容现有在线适配器的数值规则。
 * 已开启偏好时允许接口返回的图片候选，仍保留 URL 与媒体类型校验。
 * nsfw 为 true 时即使等级为 0 也过滤，两种标记不能只检查其中一个。
 * 数字等级大于 1 才是此适配器的受限范围，不将等级 1 误当布尔 true。
 * 不用 parseInt 接受半个合法数字，确保与在线列表的 numeric 处理相同。
 * 有限负数也按在线规则处理，不在补全入口添加另一套未声明的分级标准。
 * 缺省等级是兼容旧响应，不是忽略显式 nsfw=true 的依据。
 * 图片下载失败不由本函数处理，候选是否可显示还要经过实际解码。
 * @param {Record<string, unknown>} image 接口中的分级字段，不能用 URL 猜测等级。
 * @param {boolean} allowNsfw 当前用户文档中经过协议版本校验的内容偏好。
 */
function visibleImage(image, allowNsfw) {
  const level = typeof image.nsfwLevel === "number" && Number.isFinite(image.nsfwLevel) ? image.nsfwLevel : 0;
  return allowNsfw || (image.nsfw !== true && level <= 1);
}

/**
 * 缺少 type 的旧图片可按明确图片后缀识别，视频不能传给 PNG 保存器。
 * type 明确为 video 时即使 URL 伪装成 jpg 也拒绝，不下载后再猜。
 * URL 必须来自现有 HTTPS 白名单，不能把本地文件或私网地址当封面。
 * original=true 与在线卡片一样改为 640px，减少原始大图的传输与解码量。
 * 其余路径和查询参数原样保留，不能在这里截掉签名或图片身份。
 * 无效 URL 返回空值，单个脏条目不应丢掉整组可用图片。
 * 空格在地址两端去除，内部路径与编码保持原样，防止中文文件名损坏。
 * 类型缺省时后缀仅作为候选依据，最终能否保存仍由 nativeImage 判断。
 * 明确 image 类型可以没有扩展名，兼容 CDN 用标识符而非文件名的地址。
 * 不能把所有缺 type 的链接都接受，否则旧接口中的视频会当封面下载。
 * URL 先经过 allowedUrl，后续 new URL 不会因普通脏字符串意外抛错。
 * 调整尺寸不改变图片身份；Set 会在调整后合并指向相同缩略图的地址。
 * 返回空字符串由收集器统一剔除，不向下载层传入不可用占位地址。
 * @param {Record<string, unknown>} image 候选媒体的地址和类型，不负责模型文件身份。
 */
function previewUrl(image) {
  if (typeof image.url !== "string" || !allowedUrl(image.url)) return "";
  const url = image.url.trim();
  if (image.type !== "image" && (image.type != null || !/\.(png|jpe?g|webp|avif)(?:\?|$)/i.test(new URL(url).pathname))) return "";
  return url.replace("original=true", "width=640");
}

/**
 * by-hash 与模型详情有时携带不同完整度的 images，因此合并两处的同版本图片。
 * 只接受 version.id 精确相等的详情，不回退到最新版本或其他版本的封面。
 * Set 去掉重复 URL，首图失效时不会对同一个地址重复浪费重试。
 * 最多六张候选，配合上层的总截止时间，不能遍历作者的所有作品。
 * 顺序遵循接口提供顺序，第一张失败才尝试下一张，不并发加载多张大图。
 * 空数组表示当前偏好下确实没有图片候选，与后续网络失败分开。
 * 这里不发请求、不产生本地文件，所以版本身份仍先由哈希适配器核验。
 * 单个对象或 null 不能冒充图片数组，兼容上游缺失字段。
 * by-hash 的图片优先，详情中的图片只追加，不能反过来覆盖准确版本首图。
 * 只有严格相等的版本 ID 才可补充，数字与字符串不做猜测性转换。
 * 未找到同版本时依旧保留 by-hash 的图片，不要求父模型一定展开版本详情。
 * 详情的其他版本可能属于完全不同的角色或画风，不能拿来凑“有封面”。
 * 合并只复制图片引用，不修改传入的 version 或 model，避免污染来源适配。
 * 内容偏好在过滤整组前固定一次，同一批候选使用一致的本地设置。
 * 去重在截取六张前进行，重复首图不会挤掉后面原本可尝试的图片。
 * 上限只约束图片数，不裁切 URL 字符串，签名与路径不能被截断。
 * 失败重试由恢复事务控制，收集器不缓存上次的空结果阻挡后续补图。
 * 没有候选时返回空数组，调用方可明确报告 noPreview 而非网络故障。
 * @param {Record<string, unknown>} version 通过摘要核验的准确版本，图片优先从这里取。
 * @param {Record<string, unknown>} model 已核验父模型 ID 的详情，只补同版本图片。
 * @returns {string[]} 已去重、限量、可交给原下载器的图片候选，空数组表示没有候选。
 */
function collectPreviewUrls(version, model) {
  const siblings = Array.isArray(model.modelVersions) ? model.modelVersions.map(record) : [];
  const current = siblings.find(item => item.id === version.id);
  const images = [version.images, current?.images].flatMap(items => Array.isArray(items) ? items.map(record) : []);
  const allowNsfw = contentAccessEnabled();
  return [...new Set(images.filter(image => visibleImage(image, allowNsfw)).map(previewUrl).filter(Boolean))].slice(0, 6);
}

// 候选集合仅供主进程内部恢复事务使用，不扩展 preload 或 IPC 参数。
// 线上页面保留自己的过滤与展示生命周期，不把它的 React 状态引入主进程。
module.exports = { collectPreviewUrls };
