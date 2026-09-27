"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type MarkdownDocumentProps = {
  markdown: string;
  className?: string;
};

/**
 * 轻量 Markdown 渲染（无第三方依赖）：支持
 * 标题（#/##/###）、无序/有序列表、引用、分隔线、代码块、行内代码、粗体、链接、段落。
 * 仅用于内置教程文档，保持依赖最少、输出可控。
 */
export function MarkdownDocument({ markdown, className }: MarkdownDocumentProps) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {renderBlocks(markdown)}
    </div>
  );
}

function renderBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  const pushList = (ordered: boolean, items: string[]) => {
    const ListTag = ordered ? "ol" : "ul";
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={cn(
          "space-y-1 pl-5 text-muted-foreground",
          ordered ? "list-decimal" : "list-disc"
        )}
      >
        {items.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item}`}>{renderInline(item)}</li>
        ))}
      </ListTag>
    );
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    // 代码块
    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-[12px] leading-relaxed [scrollbar-width:thin]"
        >
          <code className="whitespace-pre-wrap break-words">{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // 标题
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const headingClass =
        level === 1
          ? "text-base font-semibold"
          : level === 2
            ? "mt-4 text-sm font-semibold"
            : "mt-3 text-[13px] font-semibold text-muted-foreground";
      blocks.push(
        <p key={`h-${blocks.length}`} className={headingClass}>
          {renderInline(text)}
        </p>
      );
      index += 1;
      continue;
    }

    // 分隔线
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(
        <hr key={`hr-${blocks.length}`} className="border-border/60" />
      );
      index += 1;
      continue;
    }

    // 引用
    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-2 border-border pl-3 text-[13px] text-muted-foreground"
        >
          {quote.map((text, quoteIndex) => (
            <p key={quoteIndex}>{renderInline(text)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 列表
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const matches = ordered ? /^\d+\.\s+(.*)$/.exec(current) : /^[-*]\s+(.*)$/.exec(current);
        if (!matches) break;
        items.push(matches[1]);
        index += 1;
      }
      pushList(ordered, items);
      continue;
    }

    // 段落
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        current.startsWith("#") ||
        current.startsWith(">") ||
        current.startsWith("```") ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        /^-{3,}$/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-muted-foreground">
        {renderInline(paragraph.join(" "))}
      </p>
    );
  }

  return blocks;
}

/** 行内语法：`code`、**bold**、[text](url) */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`c-${match.index}`}
          className="rounded bg-muted px-1 py-0.5 text-[12px] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        nodes.push(
          href.startsWith("http") ? (
            <a
              key={`a-${match.index}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              {label}
            </a>
          ) : (
            <Link
              key={`a-${match.index}`}
              href={href}
              className="text-foreground underline underline-offset-2"
            >
              {label}
            </Link>
          )
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
