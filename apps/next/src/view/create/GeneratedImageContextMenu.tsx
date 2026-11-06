"use client";

// 创建图片右键菜单作为视觉基准，也调用公共菜单行，避免基准页自己留一份旧样式。
// 保存、在线改名和删除仍由图片业务层处理，公共UI不获得文件写入权限。
// 点击动作后继续关闭菜单，弹窗确认与错误提示仍归原调用方。
import { ContextMenuShell } from "@/components/context-menu-shell";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuCaption, CONTEXT_MENU_SIZE_CLASS } from "@/components/context-menu-item";
import { Download, FolderInput, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

// imageName不承担唯一身份，图片文件可能重名，业务目标仍由调用方绑定。
// 菜单坐标与名字只影响展示，不能据此构造删除文件路径。
// onSaveAs仍让原图片层决定输出格式与系统另存为行为。
// onRename继续打开既有改名界面，不在共用菜单里直接修改图像Meta。
// onDelete仍保留原来的删除确认与错误边界，不因危险色统一而跳过确认。
// 原截图的“在线改名”词条保留，不擅自替换成另一套业务名称。
// 底部名称省略只是视觉处理，传入回调的目标身份不发生截断。
// 保存和改名放在同组，删除前单独分隔，方便快速识别危险操作。
// 重复右键不会新增文件任务，只有点击对应动作才通知上层。
// 预览浮层和创建结果区都引用本组件，两处会一起获得共享行修改。
// 这使视觉基准也使用抽取后的组件，避免只迁移新菜单却留下旧基准副本。
interface GeneratedImageContextMenuProps {
  x: number; y: number; imageName: string;
  onSaveAs: () => void; onRename: () => void; onDelete: () => void; onClose: () => void;
  // 菜单只发送移动意图，目标选择与路径验证仍归共用文件操作流程。
  // 忙碌状态通过参数进入，同图再次右键不会得到可重复提交的假入口。
  // 目录选择属于操作层，公共菜单不接收输出根或可任意写盘的桥接对象。
  // busy为原生disabled，键盘也无法重复触发正在等待系统框的操作。
  // 移动归在普通整理动作组，删除仍放在分隔线后保持危险操作识别。
  // 取消菜单与取消目录框是两个阶段，前者未点动作时不会启动请求。
  // 统一菜单外壳保留四边避让和滚动关闭，新条目不自己创建Portal。
  // 标签使用独立双语词条，中文省略号说明后续还需选择目标。
  // 文件名长短不参与菜单动作判断，标题省略不会改变实际文件路径。
  // onClose在动作通知后执行，业务层已拿到当前菜单文件的快照。
  onMove: () => void; moving?: boolean;
}

// 标签和标点沿用原词条，不为了统一UI改变图片保存或删除语义。
// 图标、分隔和底部名称均复用同一组参数组件，视频菜单也从此处继承视觉。
// 对象名只用来展示，动作目标仍由图片操作层的稳定身份决定。
// 外壳继续处理Portal、窗口四边避让、滚动关闭与Escape，不重新注册另一组监听。
// 此处没有异步调用，原业务回调负责请求失败、取消和确认。
// 键盘进入菜单时仍会聚焦首个可用按钮，原role=menuitem契约保留。
// 红色删除项仍与普通动作分组，避免把危险操作埋在相同颜色里。
export function GeneratedImageContextMenu({ x, y, imageName, onSaveAs, onRename, onDelete, onClose, onMove, moving }: GeneratedImageContextMenuProps) {
  const { t } = useTranslation();
  const run = (action: () => void) => { action(); onClose(); };
  return <ContextMenuShell x={x} y={y} label={imageName} onClose={onClose} className={CONTEXT_MENU_SIZE_CLASS}>
    <ContextMenuItem icon={Download} label={t("create.generatedImageContextMenu.saveAs")} onClick={() => run(onSaveAs)} />
    <ContextMenuItem icon={Pencil} label={t("create.generatedImageContextMenu.rename")} onClick={() => run(onRename)} />
    {/* 图片整理：选定目标才执行移动，关闭右键菜单不会先把源文件剪掉。 */}
    <ContextMenuItem icon={FolderInput} label={t("create.generatedImageContextMenu.move")} disabled={moving} onClick={() => run(onMove)} />
    <ContextMenuSeparator />
    <ContextMenuItem icon={Trash2} destructive label={t("create.generatedImageContextMenu.delete")} onClick={() => run(onDelete)} />
    <ContextMenuCaption>{imageName}</ContextMenuCaption>
  </ContextMenuShell>;
}
