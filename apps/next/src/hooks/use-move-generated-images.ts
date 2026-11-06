"use client";

// 单图右键与批量移动共用系统选目录、边界检查和真实磁盘移动，不操作系统剪贴板。
// 像给同一个搬家工人一张或多张地址单，确认前原图仍在，取消不是剪掉文件。
import { useRef, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useToastStore } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { getElectronAPI, resolveEffectiveOutputPath, selectLocalFolder } from "@/utils/electronBridge";
import { isPathWithinOutputRoot, moveImagesToFolderOnDisk } from "@/utils/generatedImages";

// onMoved 只处理当前调用方的选择/预览，成功后的全局列表刷新由这里统一完成。
// 每个实例持有自己的按钮忙碌状态；原生目录框是当前操作的确认边界。
// ref 锁先于 React 重渲染生效，快速连点不会打开两份选择器或重复移动同一批。
// filePaths 在选择目录前复制，后续取消勾选不能悄悄更换已交给移动流程的图片。
// 输出根在点击时决议，空设置仍使用项目默认路径，而非当前工作目录。
// 客户端检查用于就近提示，主进程原有路径/目录/文件校验仍是最终边界。
// 系统框允许浏览目录，越过输出根的选择会报错，不把保存能力扩大为任意文件搬运。
// 根目录与已有任意深度子目录都可选，不按文件夹显示名拼磁盘路径。
// 取消返回 null，尚未调用磁盘操作，保留文件、勾选和当前预览。
// 原目录或不可移动项可能返回空列表，必须提示没有移动，不给假成功反馈。
// 重名避让、旁车 JSON 一起迁移以及跨设备回退均沿用已有主进程实现。
// 渲染层不分别发复制和删除请求，避免复制失败后前端误删原图。
// 接口返回的数量才是实际完成量，不能把用户最初选中数量直接写进成功提示。
// 部分成功时 callback 仍按原侧栏约定关闭旧选择；finally 重扫磁盘读取真实现状。
// callback 不修改生成输出设置或在途队列，整理旧图不会改变后续生成的目标。
// 失败只给 Toast，不能把错误字符串当作一个新目录继续尝试。
// 原始路径不进入 Toast；主进程的安全错误会以现有 IPC 封装转成可读消息。
// finally 覆盖目录选择、路径拒绝和磁盘异常，按钮不会永久卡在移动中。
// 刷新只更新 store 的版本号，不在这里根据文件名删减其他图库实例的数据。
// 多个已挂载图库收到相同刷新后，各自按当前目录重读，保留各自展开和分页状态。
// 路径决议放在确认流程内，打开图库后修改输出设置也能读取最新根目录。
// 未配置输出目录不等于禁止整理；默认输出根由已有桥接能力决定。
// 系统返回的是目录绝对路径，不是文件夹显示名称，不能据此拼一个兄弟目录。
// 根目录本身也是合法目标，用户可以把深层文件搬回根部。
// startsWith的裸字符串检查会把相似前缀目录误当子目录，因此调用已有边界比较。
// 比较沿用Windows大小写与分隔符归一化规则，不在此再设计另一份路径算法。
// 没有移动接口时先报桌面能力不可用，不弹出一个选完也不能操作的目录框。
// target为空表示正常取消，与IPC拒绝或目录不存在的错误分开处理。
// 取消分支返回0仅用于阻止成功回调，不把取消包装为成功Toast。
// 原地移动也可能返回0，但它需要提示没有项目可添加，与取消的安静返回不同。
// 成功数量由主进程的新路径数组长度给出，不能用请求数假定全部完成。
// 这个helper不访问React状态，等待过程中只保留已提交的路径快照。
// 错误向外抛给hook统一处理，避免helper和调用组件弹出两次相同提示。
// 主进程接管每个文件的实际可用性，渲染层不能先假定所有选中文件仍存在。
// 原文件可能被另一个窗口删掉，重新扫描比在前端直接减去请求数可靠。
// 磁盘操作只有一个业务请求，不在系统框返回时立即调用独立删除接口。
// 单图和批量传入相同的字符串数组，差异只有数组长度，不需要两套IPC。
// 批量顺序沿调用方传入，不能为显示名称排序而更改选中快照。
// 文件名碰撞由主进程重命名，渲染侧不猜最终后缀序号。
// 新路径不用于改变输出设置；选择一次整理目标不会重设下一张生成的位置。
// 旧PNG的元数据不在这里重编码，搬运沿用原文件字节。
// legacy旁车的迁移也由原方法处理，不能让UI按原文件名另存一份JSON。
// 这里没有调用读取图片的API，不为选目录把整张原图加载到内存。
// 用户可能在系统框停留很久，busy覆盖整个等待期而不是仅磁盘写入期。
// 页面没有用定时器推测搬运结束，只有Promise实际结束才能放开入口。
// 回调代表已有至少一项真实完成，成功前不先关闭原图详情。
// 失败继续保留选择，方便修正目标后重试，不需要用户重新逐图勾选。
// finally里的扫描覆盖失败后的部分完成情况，文件系统不是前端数组的镜像。
// 若中途发生底层错误，不能从异常推断之前每一项都已自动回滚。
// 所以错误提示与扫描职责分开：提示说明请求失败，重读揭示现有文件状态。
// 此方法不提供跨文件事务，也不伪装成操作系统剪贴板的剪切命令。
// 使用真实移动接口满足剪切再粘贴的最终效果，不留下前端发起的重复副本。
// 单图右键绑定的是打开菜单时的文件，关掉菜单不会丢失已交给请求的地址。
// 原生目录框的结果仍经过生产preload与IpcResult解包，不能当成任意Node权限。
// 桥接不存在时明确提示而非尝试浏览器下载，因为下载会变成复制而非移动。
// 目标目录不存在的情况交给既有主进程错误，不擅自在渲染层创建文件夹。
// 回调无需知道目标名称，图库会通过实际扫描得到最终文件身份。
// 这也避免目标重名避让后继续使用已经失效的旧路径构造预览URL。
// 图库计数和图片列表分别刷新，两个版本信号服务不同的读取订阅。
// 刷新不直接写用户文档，目录移动不会生成另一套持久化索引。
// 每个hook的ref锁随实例销毁，重新进入页面不会恢复一个过期忙碌标记。
// 同步置锁发生在第一个await前，双击不会趁React尚未更新按钮时穿透。
// setMoving只负责交互反馈，实际去重依据ref，不能只检查闭包里的旧布尔值。
// 结束时即便没有可移动项目也必须释放ref，否则第二次正确目标仍无法操作。
// try覆盖路径决议、系统框和磁盘调用，三阶段任一拒绝都有同一恢复边界。
// catch将非Error拒绝转换为现有通用文案，不把未知对象直接显示成字符串。
// 回调不参与磁盘路径推断，UI层不能通过返回值重新搬运一次文件。
// 多个图库实例监听同一刷新信号，但各自的文件夹过滤和翻页仍是独立状态。
// 文件选择取消只导致重读，不把其他实例强制切回输出根目录。
// 当前页用原选择范围收尾，沿用原批量工具栏约定而不是新增全局选择管理器。
async function moveToChosenFolder(paths: string[]): Promise<number> {
  const output = useSettingsStore.getState().outputPath;
  if (!getElectronAPI()?.moveImagesToFolder) throw new Error(t("errors.desktopOnly.addImages"));
  const root = await resolveEffectiveOutputPath(output);
  const target = await selectLocalFolder(root || undefined);
  if (!target) return 0;
  if (!root || !isPathWithinOutputRoot(root, target)) throw new Error(t("create.createHistorySidebar.moveOutside"));
  const moved = await moveImagesToFolderOnDisk(output, target, paths);
  useToastStore.getState().show(moved.length
    ? t("create.createHistorySidebar.moved", { count: moved.length })
    : t("create.addImagesToFolderDialog.nothingToAdd"));
  return moved.length;
}

// 请求恢复与React忙碌状态分开：一层负责磁盘结果，一层负责当前按钮生命周期。
// 像搬家结算后先更新仓库清单，再归还门钥匙，不能清单刷新失败就永远锁门。
// finished在嵌套finally中保证执行，扫描通知意外抛错也必须释放当前实例锁。
// 外层返回完整Promise，调用方若需要等待不会得到一个提前完成的假结果。
async function runMove(paths: string[], onMoved: (paths: string[], count: number) => void, finished: () => void) {
  try {
    const count = await moveToChosenFolder(paths);
    if (count) onMoved(paths, count);
  } catch (error) {
    useToastStore.getState().show(error instanceof Error ? error.message : t("create.createHistorySidebar.moveFailed"));
  } finally {
    try {
      useHistoryFolderStore.getState().refreshGeneratedImages();
      useHistoryFolderStore.getState().refreshFolders();
    } finally {
      finished();
    }
  }
}

// hook只持有当前实例的互斥状态，文件规则全部委托给同一个请求流程。
// 选择快照在锁生效后立即复制，不读取用户等目录框期间可能改变的勾选Set。
// finished闭包归还这个实例的ref与state，不会释放另一个图库正在进行的操作。
// 没有订阅或临时媒体URL需要在卸载时释放，原生目录框由系统管理。
export function useMoveGeneratedImages(onMoved: (paths: string[], count: number) => void) {
  const lock = useRef(false);
  const [moving, setMoving] = useState(false);
  function move(filePaths: string[]) {
    if (lock.current || !filePaths.length) return;
    lock.current = true;
    setMoving(true);
    return runMove([...filePaths], onMoved, () => {
      lock.current = false;
      setMoving(false);
    });
  }
  return { moving, move };
}
