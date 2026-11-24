"use client";


// 画质复用画布原胶囊、悬浮菜单和选中样式，只注入输出尺寸这一项业务。
// 草稿像尚未签字的订单：输入不立即改工程，确认合法后才发布两个边长。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { CanvasChip } from "./components";
import { ParameterPopover } from "./parameter-popover";
import { canvasOutputDimensions, canvasOutputRatio, canvasPresetDimensions, canvasSizePatch } from "../canvas-output-size";
import type { CanvasData } from "../canvas-model";

// data 是节点的当前确认值，onChange 只提交变更补丁，不接管整张图的保存。
// 组件没有传 File 的入口，画质设置与上传参考图片是独立业务。
// 远端和本地共用像素读数和预设菜单，只有本地节点提供自定义尺寸。
// 本地参数存在于 imageParameters 的当前模板项，切模板自动读取对应项。
// CustomSize 的 close 来自同一个 ParameterPopover，确认之后返回正确的原触发器。
// 禁用字段传到胶囊而不是只增加 opacity，避免视觉灰色但仍能提交。
// width 与 height 的初值来自 canvasOutputDimensions，老预设和倍率都先得到最终像素。
// 保留字符串草稿可以支持用户从一千零二十四改成一千五百三十六的逐字输入。
// 逐字符转 Number 并写回工程会让中间的一、十五、一百五十三都变成真实参数。
// 因此本轮只在 Enter 或应用时产生一笔尺寸事务。
// Number.isSafeInteger 还防止大数精度丢失，不能用 parseInt 静默丢掉小数尾部。
// HTML min 和 step 是输入提示，不是验证的唯一来源。
// 用户粘贴的科学记数法若转换成安全且对齐整数，按数值合法性判断。
// 没有引入第二套单位转换，输入单位始终是输出像素，不支持厘米或百分比。
// 输出像素与卡片样式自定义宽高不相关，调整画质不会让卡片突然变大。
// 自定义草稿里错误后继续改字不立即自动应用，用户仍需明确确认。
// 应用成功外壳关闭，下一次打开初始化新确认值，错误标志不跨会话。
// 任一边不合法都不调用 onChange，不会在历史里留下半个新画框。
// 确认回调只构造原 size 附表，不能顺带写 batchSize、模型或媒体结果。
// 自定义表单使用原 CanvasChip 确认按钮，遵守已有悬停和按下反馈。
// 强制颜色或主题变化时文字仍继承语义 token，不单独写死白色字体。
// 菜单中显示的是已确认像素，尚未应用的两个草稿不会提前改变它。
// 本地选择两千档会真正进入请求，远端禁用两千档不会仅换一个好看的标签。
// 1K 与 2K 是既定档位文案，不使用用户翻译值作为内部计算分支。
// 菜单选中是参数状态，不表示结果图像当前已经是该尺寸。
// 生成旧结果仍保留原像素，只有下一次请求采用新目标。
// 用户可在没有生成结果时配置画质，空媒体不构成非法参数。
// 关闭侧栏不影响这个入口，因为输出尺寸已经统一归节点参数面板。
// 本轮没有添加四千档，它不是用户当前确认的必需选项。
// 以后扩展远端尺寸必须同步真实服务契约与验证，不只解除 disabled。
// 服务资源错误不会自动降低到一千档重试，避免用户不知情改变结果规格。
// 输出像素修改与批量张数修改分别是清晰的用户动作，各自进入原撤销路径。
interface Props { data: CanvasData; disabled?: boolean; onChange: (patch: Partial<CanvasData>) => void }

// 非法、未填完和不符合对应步进的尺寸留在本层，不污染已确认参数。
// 自定义不静默四舍五入，否则输入框像素与请求像素会不一致。
// 上限沿用图片尺寸契约的安全整数约束，不代表设备有对应显存。
// 宽高必须一起确认，一边输入完不应先改变请求的构图。
// 两个字符串保留空输入和半成品，避免用户删掉数字时立刻被旧值顶回。
// Number 只在确认时转换，输入期间不尝试生成工作流。
// 空串会变成零，再由对应最小尺寸拒绝，不会保存为零宽画面。
// 非整数和非八倍数都留在草稿，不暗中吸附到另一个用户没有输入的尺寸。
// 安全整数检查排除 Infinity、NaN 和超精度数字。
// 这里没有声称任意合法尺寸都能被显卡生成；服务仍会报告真实资源错误。
// 错误与字段放在同一浮层，失败不关闭，用户可以直接改正。
// aria-invalid 同时标记两边，因为确认的是整对尺寸，不猜哪边是用户真实意图。
// 提交成功只触发一次 onChange，因此撤销不会只恢复宽而留下新高度。
// Enter 与应用按钮调用同一个 commit，不另造键盘校验路径。
// Escape 由外壳处理并卸载草稿，不需要再把旧尺寸写回工程。
// 草稿卸载不会生成历史记录，取消和撤销不是同一个动作。
// autoFocus 只在打开自定义输入时发生，不会在每次节点重绘后抢光标。
// 错误文本走原语言表，像素数值仍保存为数字，不把单位写进参数。
// 尺寸后缀在只读 output 展示，避免数值字段包含无法解析的 px 字样。
// 两个 label 提供宽高语义，不能仅用乘号让辅助工具猜左右含义。
// 自定义视图每次从当前确认值初始化，关闭后重新打开不保留上次无效草稿。
// 不能把这两个 useState 提升为全局，否则同时打开其他节点会继承未确认数字。
function CustomSize({ data, onChange, close }: Props & { close: () => void }) {
  const { t } = useTranslation();
  const dimensions = canvasOutputDimensions(data);
  // 共用草稿与确认路径，仅数值步进注入图片八像素、视频偶数的业务差异。
  // 采用二像素步进可准确保存1920×1080，不为复用而偷改用户确认的1080高度。
  // 字段约束与提交校验共用同一step，不能出现输入提示合法而点击应用却失败。
  // 草稿取消仍由原浮层卸载，不会触发保存、撤销或生成任务。
  const step = data.kind === "video" ? 2 : 8;
  const [width, setWidth] = useState(String(dimensions.width));
  const [height, setHeight] = useState(String(dimensions.height));
  const [error, setError] = useState(false);
// 以用户输入十五为例，它不是八的倍数，界面保留十五并给错误，不提交十六。
// 输入空白后按应用同样保留草稿，不用默认一千零二十四覆盖用户正在删改的字段。
// 输入一千五百三十六和八百六十四是合法十六比九画框，确认后两边原值一起提交。
// 输入一点五或负八都不能生成合法 latent，安全整数和下界分别拦截。
// 只填宽还没填高时应用会检查整对输入，不把另一边缺省为当前卡片高度。
// 输入合法但计算资源不足属于服务失败，不能在本地显示参数无效掩盖真实问题。
// 应用后的菜单关闭是成功确认参数，不是生成完成提示。
// 错误标志清除依靠关闭重开或成功卸载草稿，不会把错误状态写进节点附表。
// width 与 height 都是当前 CustomSize 实例的文本，另一个菜单不能修改它们。
// 重复 Enter 关闭后原草稿已卸载，不再有第二个 commit 回调留在 document。
// 单张任务和六张任务使用同一对像素，批量值不进入该校验。
// 按 Escape 只关闭外层参数浮层，侧栏或节点的选择状态保持原样。
  const commit = () => {
    const values = [Number(width), Number(height)];
    if (values.some(value => !Number.isSafeInteger(value) || value < step || value % step)) { setError(true); return; }
    onChange(canvasSizePatch(data, values[0], values[1])); close();
  };
  return <div className="hy-quality-custom" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}>
    {/* 输出尺寸：宽高共用一笔确认，Escape由外层恢复焦点并丢弃临时草稿。 */}
    <label>{t("canvas.outputWidth")}<input autoFocus type="number" min={step} step={step} value={width} onChange={event => setWidth(event.target.value)} aria-invalid={error} /></label>
    <span>×</span><label>{t("canvas.outputHeight")}<input type="number" min={step} step={step} value={height} onChange={event => setHeight(event.target.value)} aria-invalid={error} /></label>
    <CanvasChip onClick={commit}>{t("canvas.apply")}</CanvasChip>
    {error && <small role="alert">{t(data.kind === "video" ? "canvas.videoOutputSizeInvalid" : "canvas.outputSizeInvalid")}</small>}
  </div>;
}

// 显示标签从最终长边计算，不额外保存 qualityLevel，以免标签和工作流尺寸漂移。
// 一千零二十四与两千零四十八以外的长边显示自定义。
// 打开菜单先重置自定义子视图，但不会把已经确认的自定义像素重置。
// 每张节点有自己的 custom 状态，切换另一张卡不会让它自动展开输入。
// 两个预设使用同一个比例换算函数，不能一个按长边、另一个按总像素。
// 选择预设后由外壳恢复触发焦点，用户可以继续操作相邻批量入口。
// 当前服务仅确认方形一千零二十四，远端两千档和自定义保持原生 disabled。
// 限制说明直接出现在浮层，不能让用户直到请求失败才知道尺寸没有生效。
// 远端的一千档只显示实际服务尺寸，点击不会改出一个本地 ratio 覆盖。
// 图片图标只代表输出档位，不是再次上传参考图的入口。
// output 显示计算后的两个边长，不能用卡片像素或 CSS 宽高替代。
// 预设的 aria-pressed 表达已确认长边，自定义按钮表示当前正在编辑草稿。
// 两种状态不是生成完成状态，菜单打开和选中不应出现成功通知。
// busy 从真实任务入口传入，避免推理期间改变本次已冻结的输出意图。
// 黑白主题使用同一 DOM，不为白色复制另一张画质菜单。
// 菜单壳继承原画布浮层几何，新增代码只负责选项与像素字段。
// 视频只接输出意图配置，不因菜单可用而开放尚未接通的视频生成执行器。
export function OutputQualityPicker({ data, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const dimensions = canvasOutputDimensions(data);
// 档位按长边读取，可以准确表达竖屏输出，不把竖屏短边误显示为低档。
// 一千一百五十二乘两千零四十八仍显示两千档。
// 一千五百三十六乘八百六十四显示自定义，两条数值仍在菜单 output 中可核对。
// 标签是摘要，不替代完整像素读数；相同长边也可以有不同宽高比。
// 原尺寸附表带倍率时先解析最终像素，再决定档位，不能只看 customWidth。
// 非本地一千零二十四方图不读取本地曾保存的竖屏尺寸。
// 切换工作流后渲染新的当前附表，画质摘要不会沿用另一个模板的草稿。
// 选择预设调用 onChange 后由父级受控更新，本组件不再保留第二个 side 状态。
// 在 React 更新前没有预先篡改标签，失败的工程事务不会留下假已选状态。
// 像素标签使用乘号和 px 便于阅读，持久化仍保存两个普通数字。
// 未打开过设置的节点也能显示缺省档位，不要求先创建参数表。
// 这种只读默认不会触发保存标记，查看菜单不应改变作品时间。
  // 同一菜单壳按节点类型注入档位；图片仍保留长边1K/2K规则。
  // 视频480p、720p、1K分别按短边480、720、1080计算，这是用户确认的1080p含义。
  // 画质标签只读确认像素，草稿还没应用时不会把按钮提前变成新档位。
  // 自定义尺寸恰好落在某档短边时显示该档，完整宽高继续在浮层可见。
  // 数字不是服务能力白名单，视频生成未接通，配置不弹出生成成功提示。
  // 远端限制只作用于图片来源，不把视频本地配置意外识别成Euzhi请求。
  // 使用相同CustomSize保留Enter确认、Escape取消、就地错误与焦点返回。
  // 横竖切换按短边识别，720×1280不会被错误标成1080p或自定义。
  // 输出像素仍使用纯数字保存，不把p、K或翻译后的档位名写入工程。
  // 这些选项不会改变已导入媒体的分辨率、卡片尺寸或节点位置。
  // 视频方形选择480p得到480×480，不能因为常见视频横屏就固定宽度为854。
  // 16:9的480p需要偶数宽度取整为854，720p则准确为1280×720。
  // 4:3的1080p使用1440×1080，1K名称不等于把宽固定为1920。
  // 自定义宽高一旦确认，菜单重新读取真实尺寸，不再缓存上次点过的预设按钮。
  // 同一label的图片1K和视频1K各有明确解释，组件不把它当共同1024常量。
  // 预设切换保留data.ratio意图，自定义像素可以暂时与快捷比例不匹配。
  // 这种不匹配由比例入口显示自定义，不通过偷偷裁剪尺寸来让摘要一致。
  // 自定义输入仍使用同一CustomSize，只有最小值、步进与错误词条按类型变化。
  // video分支由kind决定，不根据工作流显示名中是否含video推断类型。
  const video = data.kind === "video";
  const side = video ? Math.min(dimensions.width, dimensions.height) : Math.max(dimensions.width, dimensions.height);
  const options = video ? [{ side: 480, label: "480p" }, { side: 720, label: "720p" }, { side: 1080, label: "1K" }] : [{ side: 1024, label: "1K" }, { side: 2048, label: "2K" }];
  const label = options.find(option => option.side === side)?.label ?? t("canvas.outputCustom");
  return <ParameterPopover marker="quality" label={label} icon="image" disabled={disabled} onOpen={() => setCustom(false)}>{close => <div data-canvas-quality>
    {/* 画质菜单：1K／2K 用当前比例计算最终像素。 */}
    <div className="hy-more-menu">
      {options.map(({ side: value, label }) => <button key={value} type="button" aria-pressed={side === value} onClick={() => {
        const ratio = canvasOutputRatio(data, dimensions);
        const next = canvasPresetDimensions(ratio, value, video);
        onChange({ ...canvasSizePatch(data, next.width, next.height), ratio });
        close();
      }}>{label}</button>)}
      {!data.remoteImage && <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>{t("canvas.outputCustom")}</button>}
    </div>
    <output className="hy-output-pixels" data-canvas-output-pixels>{dimensions.width} × {dimensions.height} px</output>
    {custom && <CustomSize data={data} onChange={onChange} close={close} />}
  </div>}</ParameterPopover>;
}
