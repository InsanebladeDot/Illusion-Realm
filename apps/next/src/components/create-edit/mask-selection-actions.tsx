"use client";
/** 选区菜单与顶部复用同组动作，三种形状不维护不同的操作实现。 */
import { Check, X, Scan, Droplets, ScanLine, Trash2, Crop } from 'lucide-react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { ContextMenuItem } from '@/components/context-menu-item';
import { useTranslation } from '@/i18n';

// 菜单只改变排布，所有入口使用同一锁与选区有效性。
// 无选区显示禁用菜单，不回退成整图删除。
// after 由菜单关闭并恢复焦点，顶部无需此副作用。
interface Props { locked:boolean; menu?:boolean; after?:()=>void }
// 反选不是镜像，Delete 不是清空蒙版，两者有独立图标。
// 转蒙版与高斯模糊是既有能力，不因重排而删除。
// 裁剪只是切换唯一工具并预览，确认另由 applyCrop 执行。
// 取消只清选择，不写像素或开始上传。
// 自然形状由 store 持有，菜单不复制几何算法。
// 两种入口共用词条，避免中文名称逐渐分叉。
const ACTIONS=[{action:'cancelSelection',key:'deselect',Icon:X,id:'deselect'},{action:'invertSelection',key:'invertSelection',Icon:ScanLine,id:'invert-selection'},{action:'deleteSelection',key:'deleteSelection',Icon:Trash2,id:'delete-selection'},{action:'startCrop',key:'cropSelection',Icon:Crop,id:'crop-selection'},{action:'selectionMask',key:'selectionMask',Icon:Scan,id:'selection-mask'},{action:'gaussian',key:'gaussian',Icon:Droplets,id:'gaussian'}] as const;

// 顶部仅在完成选区时呈现；菜单无选区也呈现禁用项。
// selectionDrawing 阻止轮廓未闭合时提前删除。
// crop 确认只在唯一裁剪工具激活且存在预览时出现。
// 锁定与导入 busy 一同守住所有选区写操作。
// 已有椭圆或反选直接进入裁剪，不重建矩形。
// 窄屏可换行，操作组不覆盖正在编辑的图片。
// 控件不拥有像素历史，统一由 store 每次操作记一次。
// menu分支只替换操作行展示，action字符串仍调用原store的同一个分派入口。
// 这像同一个遥控器换了面板，不应该因此给删除键接另一套电路。
// 顶部工具栏继续用紧凑横排按钮；右键才使用整行文字和固定图标槽。
// 共用配置里的key决定翻译，id决定测试标记，二者都不从标签文字推算。
// ContextMenuItem会透传data-mask标记，原选择动作回归无需改成查CSS类名。
// 右键保留取消、反选、删除、裁剪四项，滤镜与转蒙版仍只在原工具栏展示。
// filter只筛界面项目，不删除store已经支持的动作。
// 单项disabled根据selection存在性；fieldset继续承接整组locked、busy和未闭合状态。
// 原生fieldset禁用会传递到后代button，不能用div假装禁用替代这一规则。
// 即使某个item自己的disabled为false，父fieldset锁住时浏览器也不会执行它。
// 顶栏和菜单能同时引用配置，但after只在菜单调用方注入。
// 因此点顶部反选不关闭无关面板，点右键反选则执行后关闭当前菜单。
// after不承担像素修改，也不在失败时写入一张假的新图片。
// 删除仍调用deleteSelection，它只删除有效选区内的像素，不改成清空整张画布。
// 红色危险样式由action身份决定，不依赖当前中文或英文翻译的字面内容。
// Delete尾部说明是快捷键文本，不是另一个可点击删除按钮。
// 裁剪确认与取消预览仍在原工具栏，统一右键行没有提前应用裁剪。
// 菜单组件不维护第二份selection副本，关闭再开立即读取当前store状态。
// 没有选区时菜单仍可展示禁用项，让用户知道这里支持什么操作。
// 没有绘画通道时返回空内容，原蒙版/边缘模式不会误获得像素删除权限。
export function MaskSelectionActions({locked,menu=false,after}:Props) {
  const state=useMaskWorkspaceStore(), {t}=useTranslation(), button='inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent disabled:opacity-35';
  if(state.channel!=='painting'||(!menu&&!state.selection)) return null;
  return <fieldset data-mask-selection-actions disabled={locked||state.busy||state.selectionDrawing} className={menu?'w-full':'flex min-w-0 flex-wrap items-center gap-0.5 border-l border-border/60 pl-1'}>{ACTIONS.filter(item=>!menu||['cancelSelection','invertSelection','deleteSelection','startCrop'].includes(item.action)).map(({action,key,Icon,id})=>menu?<ContextMenuItem key={action} icon={Icon} label={t(`create.maskStudio.${key}`)} destructive={action==='deleteSelection'} data-mask-selection-action={id} {...{['data-mask-'+id]:true}} disabled={!state.selection} onClick={()=>{state.action(action);after?.();}}>{action==='deleteSelection'?'Delete':undefined}</ContextMenuItem>:<button key={action} type="button" data-mask-selection-action={id} {...{['data-mask-'+id]:true}} disabled={!state.selection} className={button} aria-label={t(`create.maskStudio.${key}`)} onClick={()=>{state.action(action);after?.();}}><Icon className="h-3.5 w-3.5 shrink-0"/><span>{t(`create.maskStudio.${key}`)}</span></button>)}{!menu&&state.crop&&state.tool==='crop'&&<><button type="button" data-mask-apply-crop className={button} onClick={()=>state.action('applyCrop')}><Check className="h-3.5 w-3.5"/>{t('create.maskStudio.applyCrop')}</button><button type="button" data-mask-cancel-crop className={button} aria-label={t('create.maskStudio.cancelCrop')} onClick={()=>state.patch({crop:null})}><X className="h-3.5 w-3.5"/></button></>}</fieldset>;
}
