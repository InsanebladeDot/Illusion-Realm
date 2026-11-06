"use client";

/**
 * 界面：画布上的笔刷设置面板，复用生成参数滑块和自定义枚举。
 * 显示透明度与实际强度分开，避免导出与预览含义混淆。
 */
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { DEFAULT_MASK_BRUSH } from '@/utils/mask-paint';
import { GenerationParameterControl } from '@/view/create/generation-parameter-control';
import { OptionSelect } from '@/view/create/OptionSelect';
import { useTranslation } from '@/i18n';

// 两个颜色入口共用自由选色面板，避免分别维护 RGB 和蒙版提示色 UI。
// 自由选色只提交六位 RGB，蒙版的实际覆盖率仍由独立 alpha 决定。
// 生成锁显式穿透到 Portal，不能依赖 fieldset 的 DOM 继承。
import { ColorPicker } from '@/components/color-picker';

/**
 * 大小是原像素单位；透明度、硬度和间距以比例表示。
 * 颜色容差独立于笔刷硬度，填充始终采用连通区域。
 * 显隐只影响预览，隐藏蒙版仍会参与生成。
 * 原图没有可编辑入口，擦除只作用于绘画或蒙版层。
 * 重置仅恢复画笔设置，不清除文档或撤销历史。
 */
// 大小、硬度和间距描述后续笔迹，不会重新计算已存在的覆盖率。
// 显示透明度只调整辅助蒙版叠加，不能改变真正送给工作流的alpha。
// RGB画笔色与蒙版提示色分别保存，避免选黑色提示就输出黑色无覆盖。
// 半径使用自然像素，放大镜倍率变化不会使同一滤镜突然更强。
// 应用高斯是显式内容操作，单纯拖动半径不会反复写历史。
// 恢复默认笔刷保留文档和其他图层，不能把参数重置做成清空图片。
// 层显示开关只改变观察方式，隐藏层仍参与其既定导出通道。
// 连通范围只影响颜色选择，普通圆笔和方笔不受该开关影响。
// 局部面板使用原有主题token，暗色不添加高饱和粗边框。
// 所有中文标签从词条读取，不把工具名写成硬编码页面字符串。
export function MaskBrushPanel({ disabled = false }: { disabled?: boolean }) {
  // 设置只修改 brush 对象，不重算既有路径，历史画笔效果保持原样。
  // 每次更新基于当前组件订阅值，单个滑块不会覆盖其他已修改参数。
  // Number 范围由共享 GenerationParameterControl 夹取，避免 NaN 进入像素函数。
  // 形状下拉只映射 circle/square，未知值回落圆形，不接受任意 Canvas 操作名。
  // 同一个参数组件同时提供拖动和数值输入，保持文生图表单的交互习惯。
  // opacity 的最小值非零，避免误把看不见的笔刷当作故障。
  // displayOpacity 允许零，用户可以暂时查看无叠加的原图。
  // painted 色只影响 RGB 笔刷，mask 显示色另有独立字段。
  // fill 与 select 时才显示容差，普通画笔不出现无效选项。
  // 油漆桶连通开关禁用但保留说明，用户能看出当前固定行为。
  // active layer 的可选范围与 store 类型一致，原图只有显示开关。
  // 层显隐产生新对象，画布 effect 可以按引用变化及时重画。
  const state = useMaskWorkspaceStore(), { t } = useTranslation();
  const update = (value: Partial<typeof state.brush>) => state.patch({ brush: { ...state.brush, ...value } });
  const controls = [{ name: 'size', min: 1, max: 256, step: 1 }, { name: 'opacity', min: 0.01, max: 1, step: 0.01 }, { name: 'hardness', min: 0, max: 1, step: 0.01 }, { name: 'spacing', min: 0.05, max: 1, step: 0.05 }] as const;
  return <div data-mask-brush-panel className="space-y-4 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{t('create.maskStudio.brushSettings')}</strong><button type="button" className="text-accent-text hover:underline" onClick={() => state.patch({ brush: { ...DEFAULT_MASK_BRUSH } })}>{t('create.maskStudio.reset')}</button></div>
    {/* 形状只改变后续印章，不把整张蒙版重新转换成方形或圆形。 */}
    {/* 参数 name 为 mask 前缀，测试和 label 不会误关联右侧采样输入。 */}
    {/* 共享数值控件阻止 Enter 提交外层表单，调笔刷不会触发生成。 */}
    {/* 恢复默认不会清除图层、原图、模型或指令。 */}
    {/* 界面：圆形/方形笔刷，以及实际写入的强度参数。 */}
    <OptionSelect ariaLabel={t('create.maskStudio.shape')} value={state.brush.shape} options={(['circle', 'square'] as const).map(value => ({ value, label: t(`create.maskStudio.${value}`) }))} onChange={value => update({ shape: value === 'square' ? 'square' : 'circle' })} />
    {controls.map(control => <GenerationParameterControl key={control.name} {...control} name={`mask-${control.name}`} label={t(`create.maskStudio.${control.name}`)} value={state.brush[control.name]} onChange={value => update({ [control.name]: value })} />)}
    {/* 界面：模糊半径是实际图像像素，应用高斯时可由套索限定范围。 */}
    {/* 调节滑条只修改参数，显式点击才修改图像并记录一次撤销。 */}
    {/* 局部模糊笔复用画笔大小，半径控制柔化强度而非笔刷覆盖面积。 */}
    <div className="space-y-2 border-t border-border pt-3"><GenerationParameterControl name="mask-blur-radius" label={t('create.maskStudio.blurRadius')} min={0.5} max={24} step={0.5} value={state.blurRadius} onChange={blurRadius => state.patch({ blurRadius })} /><button type="button" data-mask-gaussian-all onClick={() => state.action('gaussian')} className="w-full rounded-lg border border-border px-2 py-1.5 hover:bg-accent">{t('create.maskStudio.gaussian')}</button></div>
    <ColorPicker disabled={disabled} marker="paint" value={state.brush.color} label={t('create.maskStudio.paintColor')} onChange={color => update({ color })} />
    {/* 两种透明度分组展示：笔刷强度写入数据，显示透明度仅叠加预览。 */}
    {/* RGB 画笔在硬度较小时也能产生透明软边，颜色选择不额外改变 alpha。 */}
    {/* 蒙版颜色改变不清导出，因为实际覆盖率没有变化。 */}
    {/* 界面：蒙版颜色和叠加透明度，不写入实际导出。 */}
    <div className="space-y-3 border-t border-border pt-3"><ColorPicker disabled={disabled} marker="mask" value={state.color} label={t('create.maskEditor.color')} onChange={color => state.patch({ color })} /><GenerationParameterControl name="mask-display" label={t('create.maskStudio.displayOpacity')} min={0} max={1} step={0.05} value={state.displayOpacity} onChange={displayOpacity => state.patch({ displayOpacity })} /></div>
    {(state.tool === 'fill' || state.tool === 'select') && <div className="space-y-3 border-t border-border pt-3"><GenerationParameterControl name="mask-tolerance" label={t('create.maskStudio.tolerance')} min={0} max={255} step={1} value={state.tolerance} onChange={tolerance => state.patch({ tolerance })} /><label className="flex gap-2"><input type="checkbox" checked={state.contiguous} disabled={state.tool === 'fill'} onChange={event => state.patch({ contiguous: event.target.checked })} />{t('create.maskStudio.contiguous')}</label></div>}
    {/* 隐藏层不会从生成剔除，用户可检查底图而不意外丢失编辑结果。 */}
    {/* 当前层控制擦除和填充；选择 RGB 画笔仍会自动转到绘画层。 */}
    {/* 复选框带可见文本标签，键盘空间键可直接切换。 */}
    {/* 原图保持只读，清空与橡皮擦均无法破坏它。 */}
    {/* 界面：图层显隐与擦除/填充的目标层。 */}
    <div className="space-y-2 border-t border-border pt-3"><strong>{t('create.maskStudio.layers')}</strong>{(['original', 'painted', 'mask'] as const).map(layer => <label key={layer} className="flex items-center gap-2"><input data-mask-visible={layer} type="checkbox" checked={state.visible[layer]} onChange={event => state.patch({ visible: { ...state.visible, [layer]: event.target.checked } })} />{t(`create.maskStudio.${layer}`)}</label>)}<OptionSelect ariaLabel={t('create.maskStudio.activeLayer')} value={state.layer} options={(['mask', 'painted'] as const).map(value => ({ value, label: t(`create.maskStudio.${value}`) }))} onChange={value => state.patch({ layer: value === 'painted' ? 'painted' : 'mask' })} /></div>
  </div>;
}
