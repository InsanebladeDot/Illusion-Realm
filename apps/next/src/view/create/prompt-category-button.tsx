import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";
import styles from "./prompt-category-button.module.css";

interface PromptCategoryButtonProps extends ComponentProps<"button"> {
  attached?: boolean;
}

/** 高级分类与提示词工具栏共用文字反馈；只有分类标签会保留选中底色。 */
export function PromptCategoryButton({ attached, className, ...props }: PromptCategoryButtonProps) {
  return <button type="button" {...props} data-prompt-category-control
    className={cn(styles.label, styles.control, attached && styles.attached, className)} />;
}
