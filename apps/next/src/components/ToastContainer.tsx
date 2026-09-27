"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useToastStore, type ToastVariant } from "@/stores/useToastStore";
import { cn } from "@/utils/cn";

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: typeof Info; iconClass: string }
> = {
  info: {
    container: "border-border bg-background text-foreground",
    icon: Info,
    iconClass: "text-muted-foreground",
  },
  success: {
    container:
      "border-green-500/40 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200",
    icon: CheckCircle2,
    iconClass: "text-green-600 dark:text-green-400",
  },
  error: {
    container:
      "border-red-500/40 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    icon: AlertCircle,
    iconClass: "text-red-600 dark:text-red-400",
  },
};

export function ToastContainer() {
  const message = useToastStore((state) => state.message);
  const variant = useToastStore((state) => state.variant);
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 transition-all duration-300 ease-out",
        message ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}
      role="status"
      aria-live="polite"
    >
      {message && (
        <div
          key={message}
          className={cn(
            "toast-pop flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg",
            style.container
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", style.iconClass)} />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
