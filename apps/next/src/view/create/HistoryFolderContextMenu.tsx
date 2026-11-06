"use client";

// 历史文件夹右键复用创建图片菜单的外壳与行，不再独立维护全局关闭监听。
// 子目录限制与删除确认仍由文件夹业务持有，统一视觉不扩大任何文件操作权限。
// 公共外壳按实测尺寸避让窗口四边，修复旧固定坐标菜单可能越界的问题。
import { ContextMenuShell } from "@/components/context-menu-shell";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuCaption, CONTEXT_MENU_SIZE_CLASS } from "@/components/context-menu-item";
import { ImagePlus, FolderPlus, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

// folderName仅供用户辨认，实际目录由父层闭包绑定，不从名称拼接磁盘路径。
// 同名不同目录仍能各自打开操作单，菜单本身不合并或去重它们。
// canCreateSubfolder来自现有层级限制，样式共享不改变允许创建的深度。
// 删除与导入是两个独立回调，不使用通用字符串命令跨越文件权限边界。
// 关闭回调只清锚点，不能顺带把当前浏览目录重置到根目录。
// 坐标由当前contextmenu事件提供，打开另一文件夹时会重新测量位置。
// 文件夹名称可能含中文、空格或长破折号，直接作为文字节点输出。
// React转义用户文字，不能把文件夹名作为菜单HTML插入。
interface HistoryFolderContextMenuProps {
  x: number; y: number; folderName: string; canCreateSubfolder: boolean;
  onAddImages: () => void; onCreateSubfolder: () => void; onDelete: () => void; onClose: () => void;
}

// 与图片菜单使用相同188px宽度、行高、图标与分隔，只有内容通过参数变化。
// 无权创建子目录时保留原生disabled，不能从统一组件绕过业务限制。
// 外部点击和Escape关闭由公共机制承担，不保留旧mousedown监听形成双重关闭。
// 滚动关闭与焦点进入也统一生效，底部名称省略仍保留title完整值。
// onDelete仍只发意图，目录删除前的检查、确认与异步错误由原页面负责。
// 关闭菜单不会写盘或清空文件夹列表，也不修改创建页当前图片选择。
// 图标与文字同时展示，三个动作在键盘和读屏路径中仍可区分。
// 回调执行后关闭的顺序与原实现一致，不把确认弹窗当作菜单内部状态。
export function HistoryFolderContextMenu({ x, y, folderName, canCreateSubfolder, onAddImages, onCreateSubfolder, onDelete, onClose }: HistoryFolderContextMenuProps) {
  const { t } = useTranslation();
  const run = (action: () => void) => { action(); onClose(); };
  return <ContextMenuShell x={x} y={y} label={folderName} onClose={onClose} className={CONTEXT_MENU_SIZE_CLASS}>
    <ContextMenuItem icon={ImagePlus} label={t("create.historyFolderContextMenu.addImages")} onClick={() => run(onAddImages)} />
    <ContextMenuItem icon={FolderPlus} label={t("create.historyFolderContextMenu.createSubfolder")} disabled={!canCreateSubfolder} onClick={() => { if (canCreateSubfolder) run(onCreateSubfolder); }} />
    <ContextMenuSeparator />
    <ContextMenuItem icon={Trash2} destructive label={t("create.historyFolderContextMenu.deleteFolder")} onClick={() => run(onDelete)} />
    <ContextMenuCaption>{folderName}</ContextMenuCaption>
  </ContextMenuShell>;
}
