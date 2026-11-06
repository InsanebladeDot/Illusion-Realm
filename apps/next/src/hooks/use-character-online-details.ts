"use client";

/**
 * 角色详情将本地筛选记录与在线展示资料结合，不改变分类的身份基准。
 * 只有点击本地角色详情才查询在线资料，分类卡片直接加载关联封面。
 * 打开分类页不为每张卡查询搜索 API，封面不阻塞本地筛选结果。
 * 线上卡片原本已含详情，直接复用而不再次查询同一角色。
 * 结果以源对象标记归属，快速切换角色不能把 A 的图片显示在 B 上。
 * cleanup 阻止迟到响应提交状态，不能因为用户关闭弹窗仍弹出错误提示。
 * 请求仍通过已有安全 IPC，hook 不直接 fetch 站点或读取本机文件。
 * 无匹配与网络失败分开说明，二者都保留可用的本地标签。
 * 不因一次缺图反复猜名、切换作品或递归查询。
 */
import { useEffect, useState } from "react";
import type { AnimadexCharacter } from "@/types/character";
import { mergeCharacterDetails, searchCharacters } from "@/utils/characters";

/**
 * requested 记录触发请求的角色引用，用来校验结果是否属于当前详情。
 * status 只描述线上补全，不覆盖父页面的本地筛选加载状态。
 * character 为空时表明无匹配，调用方继续使用本地原对象。
 * unavailable 与 missing 均不是角色不存在的证明。
 * 在线数据中的任意说明不会成为系统指令或新的工具权限。
 * hook 不下载 LoRA，不向外部发送用户模型目录或历史提示词。
 */
interface OnlineCharacterDetails {
  // 使用源对象引用对照，详情 A 关闭后重开 B 时不复用 A 的媒体。
  // 父组件的本地 slug 稳定，但对象变化可能意味着来源或筛选已刷新。
  // 仅核对同名字符串不足以阻止两个作品之间的数据串用。
  requested: AnimadexCharacter;
  // null 表示没有唯一匹配，不表示本地角色已经失效。
  // 非空对象由严格合并函数产生，保留本地属性和收藏身份。
  // 线上封面可以为空，即使匹配成功也不伪造一个可用图片地址。
  character: AnimadexCharacter | null;
  // matched 只表示姓名与作品唯一一致，不证明资料的百科准确性。
  // missing 含零匹配与多匹配，都不能擅自选取排名第一的结果。
  // unavailable 只描述网络或 IPC 故障，不将其谎称为站点未收录。
  status: "matched" | "missing" | "unavailable";
}

/**
 * 首帧即显示本地资料，线上请求不会让整个详情空白或阻塞关闭按钮。
 * effect 只依赖当前选择引用，不因普通主题切换重新联网。
 * 每次请求最多八个姓名候选，合并函数另外检查作品与唯一性。
 * API 无匹配不触发第二种别名查询，用户可继续使用本地角色标签。
 * 网络异常在这里显式消费，用本地可用状态收尾，不产生未处理 Promise。
 * pending 不存额外布尔值，当前 source 与结果归属即可准确推导。
 * 关闭或切换后 cleanup 将 cancelled 置真，旧回执无法替换新详情。
 * 同一身份在新一次打开时可重试，失败不会被永久缓存成“不存在”。
 * 仅展示资料属于只读行为，不需要写用户配置或新建 IPC 通道。
 * 返回通知 key 由组件 i18n 翻译，错误中不拼入上游堆栈或用户路径。
 * 本地属性与线上媒体的职责分开，出现同名不同作品时不借图补齐。
 */
export function useCharacterOnlineDetails(selected: AnimadexCharacter | null) {
  // resolved 不在 effect 开始时清空，避免关闭/打开时不必要的同步 setState。
  // 是否可使用旧值由 requested === selected 判断，旧值不会先绘制一帧。
  // 缺少选中对象时返回 null，原详情组件仍按关闭状态不渲染。
  const [resolved,setResolved] = useState<OnlineCharacterDetails | null>(null);
  useEffect(() => {
    // 明确的 local 前缀才允许补全，防止其他自定义卡片触发额外网络请求。
    // 同一个角色在纯 online 模式下无需再次向服务查询相同姓名。
    // source 选择不能变成外部提供任意 URL 的能力，端点仍由主进程固定。
    if (!selected?.slug.startsWith("local:")) return;
    // 标记属于本次 effect 实例；下一次选中变化会建立独立取消状态。
    // 此标记只控制回执提交，不声称能够撤销已发出的 HTTP 请求。
    // 真正网络等待沿用主进程的受控请求超时，不在 hook 中无限重试。
    let cancelled = false;
    void (async () => {
      try {
        // 查询只发送已经选择的角色名，不发送本地磁盘路径、聊天记录或模型名。
        // 不额外传作品 slug，因为远端 slug 与本地作品原文格式可能不同。
        // 返回后统一核对两个身份字段，避免远端宽松姓名搜索带来串图。
        const result = await searchCharacters({source:"online",q:selected.name,pageSize:8});
        // 合并器负责唯一性，hook 只负责异步生命周期，不再重复写匹配算法。
        // 此处不会将推荐 LoRA 直接交给生成队列，更不会自动下载权重。
        // 颜色仍按本地选择返回，远端更改标签不影响用户已选的筛选条件。
        const character = mergeCharacterDetails(selected,result.results);
        // 只有当前详情仍在观察此请求才提交，旧详情的回应不会触发 UI 更新。
        // status 与 character 同一个对象提交，避免先显示成功提示却仍用旧封面。
        // 无唯一结果也正常完成，用户可以继续使用本地触发词而不被阻断。
        if (!cancelled) setResolved({requested:selected,character,status:character?"matched":"missing"});
      } catch {
        // 不把异常原文送到展示层，避免上游堆栈或路径进入用户界面。
        // 失败不启动第二次查询，不猜另一个译名或不同作品来凑一张图。
        // 清理后失败同样不提交，防止关闭后出现与当前页面无关的错误状态。
        if (!cancelled) setResolved({requested:selected,character:null,status:"unavailable"});
      }
    })();
    // 返回清理覆盖切换、关闭和路由卸载，不能只依赖点击关闭按钮。
    // React 开发态重放 effect 时，第一份请求结果也会被这一门槛隔离。
    // 没有共享全局 pending，因此并行打开其他资料页不会误取消本页。
    return () => { cancelled=true; };
  },[selected]);
  // 前一次 resolve 可能比新角色渲染更早存在，归属比较在每次 render 重新执行。
  // 当前无结果时立即回落 selected，不等待网络才能展示角色姓名和标签。
  // notice 使用稳定 key，界面语言变化不会重发查询，只重新翻译提示。
  // matched 即使没有真实预览 URL 也不展示请求错误，原占位继续说明无预览。
  // missing 显示站点未找到一致身份，不应改写本地分类表或删除原角色。
  // unavailable 保留本地文本，用户可以照常插入提示词，不被网络故障锁住。
  // 参考资料不生成额外的 LoRA 文件名，也不把推荐 URL 直接变成加载参数。
  // 当前选择为空时 local 为 undefined，返回的通知也应为空而非伪报加载中。
  // 所有返回值在渲染期推导，不另开 effect 同步派生 pending 状态。
  // 只有展示对象改变，用户是否确认和应用仍由外层原回调决定。
  // 本函数不增加 Agent 工具轮次，属于用户点击详情后的只读补全。
  // 主进程网络超时后 catch 会结束等待；没有定时自我递归的重试任务。
  const active = resolved?.requested === selected ? resolved : null;
  const local = selected?.slug.startsWith("local:");
  const notice = !local || active?.status === "matched" ? null : !active ? "characters.reference.onlineLoading" : active.status === "missing" ? "characters.reference.onlineMissing" : "characters.reference.onlineUnavailable";
  return {character:active?.character || selected,notice} as const;
}
