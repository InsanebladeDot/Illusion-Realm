"use client";

/** 字体选择保留在当前属性实例，加载成功后才提交到气泡文档。 */
// 继续使用SimpleSelect，不另外复制下拉菜单、焦点与主题样式。
// onPatch绑定调用方当前id，异步结果不会靠“最新选中id”猜目标。
// 组件按图层id挂载，切换气泡或离开页面后旧结果不再提交。
// request像取号单，先选字体A再选B时，A迟到不能覆盖B。
// 状态只描述真实FontFace与资源读取，失败保留原文档字体。
import { useEffect, useRef, useState } from "react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { DIALOGUE_FONTS, loadDialogueFont } from "./dialogue-fonts";

// 接收确定的实例值和最小意图，不在共享下拉组件中导入漫画业务。
// system表示沿用原系统字库，undefined兼容旧图层。
// 不在每次render自动加载整个目录，只有明确选择才读取对应文件。
// 英文字体提示放在选项标签，避免用户误以为十款都具有完整中文字形。
// 错误与加载反馈紧邻选择器，其他属性仍可继续操作。
// 超时后可以重新选同一字体，不把失败状态永久写进作品历史。
// useEffect清理递增号码，不对已离开属性实例进行状态更新。
// shared缓存仍可继续供其他气泡使用，不因一个控件卸载取消公共资源。
export function DialogueFontPicker({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  // value属于已确认文档，status属于此选择器的一次尝试，两者不可用同一个变量表示。
  // 加载时保持原值显示，避免用户把正在尝试的字体当成已经应用。
  // 状态既不写入history也不落盘，失败提示不会被撤销重做还原成旧请求。
  // effect只负责卸载失效号码，没有全局事件、定时器或窗口监听需要额外注销。
  // request初值不携带图层id，实例key已经由LayerProperties限定归属。
  // 若用户从一个气泡切到另一个，即使字体相同，两处loading与错误仍互不继承。
  // 已选资源的字节可以共享，用户是否选择该资源的状态不能共享。
  // 回调签名只接受id而非整个目录对象，文档不会重复保存来源URL和许可文本。
  // 系统选项使用保留id，实际绘制由dialogueFontFamily统一决定回落。
  // 切回系统字体会直接提交，不必等待任何内置字体读取结束。
  const { t } = useTranslation(), request = useRef(0);
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  useEffect(() => () => { request.current++; }, []);
  // loading不禁止改选，用户可以立即切回系统字体而不用等待旧请求。
  // 号码在任何一次选择都递增，系统回落同样会使旧异步结果失效。
  // 只有号码仍匹配才调用业务回调，组件卸载和连续选择共用同一边界。
  // catch只显示当前请求的失败，A失败不应覆盖B成功的反馈。
  // await返回前不提交fontId，因此导出不会读到一个尚未可用的内置字体。
  // 没有finally无条件复位，防止旧请求把新请求的loading提前结束。
  // 字体本身可能仍在缓存加载，这里不把那种共享等待说成已取消网络读取。
  const choose = async (id: string) => {
    // 号码按用户操作顺序递增，而不是按Promise完成顺序排列。
    // 比如先选A再选B，A最后完成也不能把已经应用的B换回去。
    // catch仅处理自己仍在前台的一次尝试，迟到失败不会盖住当前字体的成功。
    // 即使取消展示，底层共享加载仍可成功缓存，下一次选择不必重读文件。
    // 对system的分支在await前返回，因此不会出现上一请求最后把系统选项覆盖掉。
    // 成功写入id会触发正常文档patch，撤销可以恢复此前的字体。
    // 失败没有调用onChange，所以不会增加一条“失败字体”的内容历史。
    // 状态复位发生在有效请求分支，不用无条件finally影响新请求。
    // 这个函数不触碰selectedId，字体选择从不顺便改变当前操作对象。
    // 当前字体的加载错误可在同一菜单重新尝试，无需删除气泡或重开工具。
    // 错误信息使用固定词条，不把浏览器FontFace解析错误直接暴露给用户。
    // Promise在本函数内被catch接住，事件回调使用void也不会留下未处理拒绝。
    const token = ++request.current;
    if (id === "system") { setStatus("ready"); onChange(id); return; }
    setStatus("loading");
    try {
      await loadDialogueFont(id);
      if (token === request.current) { onChange(id); setStatus("ready"); }
    } catch { if (token === request.current) setStatus("error"); }
  };
  // side：菜单与当前气泡字体绑定；无障碍名称和加载提示都走双语词条。
  // 正文中的字体变化通过父级patch回流，选择器不写SVG或用户文件。
  // 官方字体名属于资源名，中文/英文字形适用范围由本地化提示补充。
  // portal菜单继续由SimpleSelect管理关闭和焦点归还，不由字体异步回调操纵焦点。
  // status区域只在加载或失败时占空间，正常状态不会永久多留一行“成功”提示。
  // 选择器保持可用，用户无需为一个错误等待强制重试倒计时。
  // 中文字体沿用作者原名，避免把字体“用途提示”伪装成作者正式命名。
  // 英文菜单中的英文漫画标签经过i18n，切换语言后不残留中文类别说明。
  // 系统默认是明确选项，不让空字符串在菜单中显示成无法理解的空白行。
  // options虽然由目录映射生成，各项value保持稳定，排序变化不会错配资源。
  // 该组件没有自己的导出按钮，确保下载仍只有页面级一个真实操作边界。
  // 资源错误不通过alert弹窗阻断编辑，用户可以保留原字体继续调整其他参数。
  return <div data-dialogue-font-picker className="space-y-1 text-xs">
    <span>{t("dialogue.font")}</span>
    <SimpleSelect ariaLabel={t("dialogue.font")} value={value ?? "system"} options={[{ value: "system", label: t("dialogue.systemFont") }, ...DIALOGUE_FONTS.map(font => ({ value: font.id, label: font.latin ? `${font.name} · ${t("dialogue.latinFont")}` : font.name }))]} onChange={id => { void choose(id); }} portal />
    {status !== "ready" && <p role={status === "error" ? "alert" : "status"}>{t(status === "error" ? "dialogue.fontError" : "dialogue.fontLoading")}</p>}
  </div>;
}
