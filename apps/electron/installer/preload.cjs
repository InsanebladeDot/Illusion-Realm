/**
 * 安装页面只获得固定动作，不暴露 ipcRenderer、文件系统或任意命令执行。
 * 通道表与独立安装主进程共用，不混入客户端业务 IPC。
 * 页面参数在主进程重新检查，preload 的方法不是安全校验的替代品。
 * 每个异步结果都返回 success/data 或 success/error，由 UI 显示恢复信息。
 * 没有持续事件订阅，页面关闭不会留下进度监听器。
 * 向导安装是单次长调用，等待期间使用不定进度条，不伪造文件释放比例。
 * 资源读取只通过 info 返回必要字段，不向页面开放路径读写接口。
 * 最小化与关闭仅作用于当前向导，不能控制其他窗口或客户端实例。
 */
const { contextBridge, ipcRenderer } = require('electron');
const { CHANNELS } = require('./service.cjs');
contextBridge.exposeInMainWorld('installer', Object.freeze(Object.fromEntries(Object.entries(CHANNELS).map(([key, channel]) => [key, value => ipcRenderer.invoke(channel, value)]))));
