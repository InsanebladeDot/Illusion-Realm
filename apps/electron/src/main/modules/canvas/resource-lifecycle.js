/** 主进程回收调度：启动补查、运行时五分钟检查；退出清定时器，不让后台失败丢失。 */
/** @param {ReturnType<typeof import('./canvas-library').createCanvasLibrary>} library */
function startResourceCleanup(library) {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const result = await library.sweep();
      if (result.failed) console.warn({ module: 'canvas-resource', reason: 'files-retained', count: result.failed });
    } catch { console.error({ module: 'canvas-resource', reason: 'cleanup-deferred' }); }
    finally { running = false; }
  };
  const initial = setTimeout(() => { void check(); }, 1000);
  const timer = setInterval(() => { void check(); }, 5 * 60 * 1000);
  initial.unref();
  timer.unref();
  require('electron').app.once('will-quit', () => { clearTimeout(initial); clearInterval(timer); });
}

/** 多次请求只绑定一次；渲染进程崩溃和窗口销毁都释放租约但不授权回收。 @param {ReturnType<typeof import('./canvas-library').createCanvasLibrary>} library */
function bindResourceOwners(library) {
  const connected = new WeakSet();
  return (/** @type {Electron.WebContents} */ sender) => {
    if (connected.has(sender)) return;
    connected.add(sender);
    const release = () => library.disconnect(sender.id);
    sender.once('destroyed', release);
    sender.on('render-process-gone', release);
  };
}

module.exports = { startResourceCleanup, bindResourceOwners };
