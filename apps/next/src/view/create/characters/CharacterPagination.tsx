"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

type CharacterPaginationProps = {
  page: number;
  pages: number;
  /** 当前页实际渲染的条目数（用于「显示第 X-Y 个」） */
  count: number;
  /** 每页条目数 */
  pageSize: number;
  /** 结果总数 */
  total: number;
  /** 条目单位（默认「角色」，动作库传「动作」） */
  itemLabel?: string;
  /** 数据钩子前缀（默认 character，动作库用 pose） */
  testIdPrefix?: string;
  onChange: (page: number) => void;
};

/**
 * 分页栏（浅色极简）：
 * 左浮动「共 N 个角色 | 显示第 X-Y 个」，右浮动「首页 / < 上一页 / 下一页 > / 尾页」。
 * 固定在 Main 展示区底部（卡片滚动区之下），不随卡片滚动。
 */
export function CharacterPagination({
  page,
  pages,
  count,
  pageSize,
  total,
  itemLabel,
  testIdPrefix = "character",
  onChange,
}: CharacterPaginationProps) {
  const { t } = useTranslation();

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const itemLabelText = itemLabel ?? t("characters.pagination.itemLabelDefault");
  /** 页码输入框的草稿值（用户可自定义输入页码后回车跳页） */
  const [draft, setDraft] = useState(String(page));

  /**
   * 渲染期同步：外部 page 变化（翻页、跳页）时把草稿拉回最新页码。
   * 用户正在输入时 page 不变，因此不会打断输入 —— 与原先 effect 语义一致。
   */
  const [previousPage, setPreviousPage] = useState(page);
  if (page !== previousPage) {
    setPreviousPage(page);
    setDraft(String(page));
  }

  if (pages <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + Math.max(count, 1) - 1;

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pages);
    if (clamped !== page) onChange(clamped);
    else setDraft(String(page));
  };

  const commitDraft = () => {
    const parsed = Number.parseInt(draft.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(page));
      return;
    }
    go(parsed);
  };

  return (
    <nav
      {...{ [`data-${testIdPrefix}-pagination`]: "true" }}
      aria-label={t("characters.pagination.ariaLabel")}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#E8E8E8] bg-white px-3 py-2"
    >
      <span
        {...{ [`data-${testIdPrefix}-pagination-info`]: "true" }}
        className="text-xs text-[#888888]"
      >
        {t("characters.pagination.totalPrefix")}
        <span className="font-medium text-[#333333]">{total.toLocaleString("zh-CN")}</span>
        {t("characters.pagination.unitSuffix")}
        {itemLabelText}
        <span className="mx-1.5 text-[#D1D5DB]">|</span>
        {t("characters.pagination.rangePrefix")}
        <span className="font-medium text-[#333333]">{from}</span>-
        <span className="font-medium text-[#333333]">{to}</span>
        {t("characters.pagination.unitSuffix")}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <PageButton
          testId="first"
          prefix={testIdPrefix}
          label={t("characters.pagination.first")}
          disabled={page <= 1}
          onClick={() => go(1)}
        />
        <PageButton
          testId="prev"
          prefix={testIdPrefix}
          label={t("characters.pagination.prev")}
          icon="left"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        />
        {/* 页码指示：与左右分页按钮同一套浅色极简风格，数字可自定义输入，回车 / 失焦跳页 */}
        <span
          {...{ [`data-${testIdPrefix}-page-indicator`]: "true" }}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs text-[#333333]"
        >
          <input
            type="text"
            inputMode="numeric"
            aria-label={t("characters.pagination.pageInputLabel")}
            {...{ [`data-${testIdPrefix}-page-input`]: "true" }}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              }
            }}
            className="h-6 w-9 rounded-md bg-[#F8F9FA] text-center text-xs font-medium text-[#333333] outline-none transition-colors hover:bg-[#F3F4F6] focus:bg-white focus:ring-2 focus:ring-[#A78BFA]/40"
          />
          <span
            {...{ [`data-${testIdPrefix}-page-suffix`]: "true" }}
            className="whitespace-nowrap text-[#888888]"
          >
            / {pages}{t("characters.pagination.pageSuffix")}
          </span>
        </span>
        <PageButton
          testId="next"
          prefix={testIdPrefix}
          label={t("characters.pagination.next")}
          icon="right"
          disabled={page >= pages}
          onClick={() => go(page + 1)}
        />
        <PageButton
          testId="last"
          prefix={testIdPrefix}
          label={t("characters.pagination.last")}
          disabled={page >= pages}
          onClick={() => go(pages)}
        />
      </div>
    </nav>
  );
}

function PageButton({
  testId,
  prefix,
  label,
  icon,
  disabled,
  onClick,
}: {
  testId: string;
  prefix: string;
  label: string;
  icon?: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      {...{ [`data-${prefix}-page`]: testId }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#333333] transition-colors hover:bg-[#F8F9FA]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
      )}
    >
      {icon === "left" && <ChevronLeft className="h-3.5 w-3.5" />}
      {label}
      {icon === "right" && <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}
