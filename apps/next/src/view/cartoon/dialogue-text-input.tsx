"use client";

/** 正文默认只读，双击气泡或此字段后解锁，样式调整无需进入正文编辑。 */
// 像先选中便签改外观，再双击打开内容，避免拖动时误输入文字。
// 编辑许可由宿主选中会话提供，不在控件里另存一个会串层的全局开关。
// value始终受控，锁定只禁止输入，不清空正文或制造新的内容历史。
// 右栏保留textarea作为唯一文字编辑器，不在SVG复制另一套富文本输入。
// 双击画布后effect把焦点放入这一个真实输入，Delete继续受现有保护。
import { useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";

// 使用明确回调区分解锁、完成和正文修改，完成不等于保存工程。
// Enter保留普通换行，不能用它自动结束漫画多行对白编辑。
// Escape只结束当前正文输入，不让窗口级快捷键同时清除画布选择。
// 完成后文本仍保留，样式控件继续指向同一实例。
// 切换图层使旧控件按id卸载，不会把它的焦点引用用于新对象。
// 焦点在effect中设置，静态预渲染不读取document或DOM节点。
// readOnly保留复制和选择能力，不使用disabled使正文变得难以阅读。
// 双击提示同时是title与可见说明，键盘用户可通过回车解锁只读框。
// 120字约束与已有编辑器一致，本次没有改变正文长度或换行计算规则。
export function DialogueTextInput({ value, editing, onEdit, onDone, onChange }: { value: string; editing: boolean; onEdit: () => void; onDone: () => void; onChange: (text: string) => void }) {
  // ref只保存本输入节点，不把HTML元素写入作品状态或历史快照。
  // 编辑许可从false变true时聚焦一次，用户打字引起的value变化不抢回焦点。
  // 未锁定时Tab仍按原生顺序进入下一个属性，不创建全局键盘捕获。
  // Escape需要停止传播，否则全局画布监听会同时把选中对象取消。
  // 未编辑时回车阻止默认换行再解锁，不能把用于解锁的回车写成正文首个换行。
  // 已编辑时回车不被此逻辑拦截，连续多行对白保持浏览器原生输入体验。
  // 中文输入法事件仍经原生textarea处理，没有逐键重写正文或破坏组合输入。
  // 只读字段的onChange也校验editing，自动化或脚本事件不能当作用户已解锁。
  // 完成按钮不会提交额外正文，内容修改早已由受控onChange写入文档。
  // 文字草稿不在此重复存储，因此撤销恢复时显示值始终来自当前图层。
  // 文本计数用码点显示，maxLength仍沿原UTF-16约束，不新增超长输入承诺。
  // 右栏滚动归宿主，focus触发的正常滚入视口不改变画布上的气泡位置。
  const { t } = useTranslation(), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  return <label className="block space-y-1 text-xs">
    {/* side：正文锁定和数值属性彼此独立；单击气泡仍可调整字号、字体等样式。 */}
    {/* textarea显式readOnly并在事件处再次核查，脚本派发input也不能绕开锁定。 */}
    {/* 完成按钮只结束输入状态，不给出已保存或已导出的假反馈。 */}
    <span className="flex items-center justify-between">{t("dialogue.text")} · {Array.from(value).length}/120{editing && <button type="button" className="text-primary hover:underline" onClick={onDone}>{t("dialogue.finishText")}</button>}</span>
    <textarea ref={input} data-dialogue-text rows={4} maxLength={120} readOnly={!editing} value={value} title={t("dialogue.editTextHint")} onDoubleClick={onEdit} onChange={event => { if (editing) onChange(event.target.value); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onDone(); } else if (!editing && event.key === "Enter") { event.preventDefault(); onEdit(); } }} className="w-full resize-y rounded-lg border border-input bg-background p-2 outline-none focus:border-primary/30 focus:ring-0" />
    {!editing && <span className="block text-muted-foreground">{t("dialogue.editTextHint")}</span>}
  </label>;
}
