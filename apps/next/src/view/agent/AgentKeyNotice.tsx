"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAgentSecretStore } from "@/stores/useAgentSecretStore";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/** 带 `#agent` 锚点：落到设置页里 Agent 那一块（`SettingsPage` 的 section id） */
const SETTINGS_HREF = "/settings#agent";
/** 方向判定只用路径，不带 hash */
const SETTINGS_PATH = "/settings";

/**
 * 「还没配置 API Key」的提示条 —— 挂在输入区正上方。
 *
 * 只在**用户真的按了发送**之后才出现（`missingNotice` 由 `sendDraft` 置位）：
 * 一进页面就糊一条警告会让「先去设置里配好」变成打扰，而用户此刻可能只是想看看界面。
 * 出现后点右侧文字即可跳到设置页的 Agent 区块。
 *
 * 锚点与跳转都写在这里，**别**把 id 或路径复制到别处：设置页改了 section id，
 * 这个链接就会落到页面顶部 —— 不报错、只是落点不对，属于最难发现的那类退化。
 */
export function AgentKeyNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const loaded = useAgentSecretStore((state) => state.loaded);
  const configured = useAgentSecretStore((state) => state.status.configured);
  const missingNotice = useAgentSecretStore((state) => state.missingNotice);
  const refresh = useAgentSecretStore((state) => state.refresh);

  // 挂载时读一次：设置页刚配好（或 `.env` 改了）时这里要跟上，不能拿旧状态拦人
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 与侧边栏同一套页面切换（带方向 + 过渡），不是浏览器那种硬跳 */
  const openSettings = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      startPageNavigation({
        href: SETTINGS_HREF,
        push: () => router.push(SETTINGS_HREF),
        direction: resolvePageDirection(pathname, SETTINGS_PATH),
      });
    },
    [pathname, router]
  );

  if (!loaded || configured || !missingNotice) return null;

  return (
    <div className="shrink-0 px-4 pb-2">
      <div
        data-agent-key-notice
        className={cn(
          "flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300",
          THIN_BORDER_CLASS
        )}
      >
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{t("agent.notice.missingKeyTitle")}</p>
          <p className="break-words">
            {t("agent.notice.missingKeyBody")}{" "}
            <Link
              href={SETTINGS_HREF}
              data-agent-key-notice-link
              onClick={openSettings}
              className="font-semibold underline underline-offset-2"
            >
              {t("agent.notice.missingKeyLink")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
