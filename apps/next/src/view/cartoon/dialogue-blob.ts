/** 漫画二进制读取：导入背景、内嵌图片与离线字体共用带超时的data URL转换。 */
// 只共享读取机制，不合并图片与字体的大小、格式或解码策略。
// 这像同一个扫描器扫描不同材料，材料能否入库仍由各业务入口判断。
// 不依赖render或fonts模块，避免两种导出资源互相import形成循环。
import { t } from "@/i18n";
// image和font模块都只依赖这个底层读取器，底层不反过来认识它们。
// 这种依赖方向避免字体导出调用图片工具、图片工具又调用字体形成循环初始化。
// 失败消息保持原有读取契约，最终选择器和导出按钮仍会映射成各自操作级提示。
// 数据进入此函数之前已经由调用方完成来源判断，不增加任意路径读取接口。
// ArrayBuffer转Blob由字体调用方负责，这里继续只认浏览器标准Blob输入。
// 原render文件转发同名export，现有背景导入调用方无需批量修改import。
// 不为字体另写一个缺超时和清理的FileReader，故障语义也因此保持一致。
// 迁移后的行为与此前相同，测试仍通过真实文件和真实字体确认返回可解码内容。

// FileReader同时服务导入文件与导出时的静态图片嵌入。
// data URL 自包含，不会把本机路径写进SVG或PNG。
// 读取失败、取消都拒绝，由拥有操作的按钮显示本地化反馈。
// 定时器只限制真实读取，不伪造加载或播放进度。
// 结束后统一移除事件和计时器，页面不留下活动Reader回调。
// 超时会中止Reader，防止一个损坏文件占住加载按钮。
// reader.result必须是字符串，ArrayBuffer不被强转后假装可用。
// 该方法不增加头像工具的体积限制；漫画背景使用自己的20MB规则。
// 因此没有直接调用头像readImageFileAsDataUrl，两个业务的输入契约不同。
// Blob来自同源静态资源或用户选择，不接受远程URL作为直接输入。
// 失败不返回空串，避免调用者把“无背景”和“读取失败”混淆。
// timeout处理器先终结Promise再abort，防止onabort覆盖明确的超时边界。
// 导出的临时Blob在Image完成或失败后会释放，不写入用户文档。
// 本方法不拥有UI状态，finally恢复由外层统一负责。
export function readDialogueBlob(blob: Blob): Promise<string> {
  // 这里的Blob既可能是用户File，也可能是fetch得到的静态PNG响应体。
  // 统一读取能让导出内嵌和背景导入共享错误清理，文件大小策略仍由各入口决定。
  // 读取器事件必须在readAsDataURL之前安装，缓存快慢不应影响是否能收到结果。
  // finish不直接操作UI，拒绝沿await回到宿主的catch才能显示对应导入或导出错误。
  // 报错文案不附blob内容，避免把整张图片数据或原始私人文件名写入控制台。
  // timer限制这一阶段读取，不能将它当作包含全部模板获取的整轮15秒保证。
  // finish先解绑事件再abort，取消产生的浏览器事件不应第二次结算操作。
  // 结果即使是data前缀也不代表图片有效，实际解码仍由下一阶段独立验证。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = window.setTimeout(() => { finish(); reader.abort(); }, 15000);
    function finish(value?: string) {
      window.clearTimeout(timer); reader.onload = reader.onerror = reader.onabort = null;
      if (value) resolve(value); else reject(new Error(t("dialogue.importError")));
    }
    reader.onload = () => finish(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = reader.onabort = () => finish();
    reader.readAsDataURL(blob);
  });
}

