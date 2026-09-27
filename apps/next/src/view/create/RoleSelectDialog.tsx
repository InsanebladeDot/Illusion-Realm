"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import { Info, Star, X } from "lucide-react";
import {
  CREATE_ROLES,
} from "@/data/roles";
import type { CreateRole, SelectedRole } from "@/types/role";
import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type RoleSelectDialogProps = {
  open: boolean;
  selected: SelectedRole;
  onOpenChange: (open: boolean) => void;
  onSelect: (selected: SelectedRole) => void;
};

function roleKey(roleId: string, modelId: string) {
  return `${roleId}:${modelId}`;
}

export function RoleSelectDialog({
  open,
  selected,
  onOpenChange,
  onSelect,
}: RoleSelectDialogProps) {
  const { t } = useTranslation();
  const [draftModels, setDraftModels] = useState<Record<string, string>>({});

  /**
   * 渲染期同步：**每次**打开（或外部 selected 变化）时按当前选中项重建草稿。
   * 原本这段在下面的 effect 里与键盘监听混在一起，拆开后监听保持原样。
   *
   * 注意：key 里带了 open，因此必须在**两个方向**上都记录前值
   * ——若加上 `open &&` 前置条件，关闭时前值不会更新，再次打开时会跳过重建，
   * 残留上次未保存的模型选择。
   */
  const [previousDraftKey, setPreviousDraftKey] = useState<string | null>(null);
  const draftKey = `${open}|${selected.roleId}|${selected.modelId}`;
  if (draftKey !== previousDraftKey) {
    setPreviousDraftKey(draftKey);
    if (open) {
      const initial: Record<string, string> = {};
      for (const role of CREATE_ROLES) {
        initial[role.id] =
          selected.roleId === role.id
            ? selected.modelId
            : role.models[0]?.id ?? "";
      }
      setDraftModels(initial);
    }
  }

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSelect = (role: CreateRole) => {
    const modelId = draftModels[role.id] ?? role.models[0]?.id ?? "";
    onSelect({ roleId: role.id, modelId });
    onOpenChange(false);
  };

  const selectedKey = roleKey(selected.roleId, selected.modelId);

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-select-dialog-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] flex h-[100dvh] max-h-[100dvh] w-[calc(100vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden border bg-background px-0 pb-0 pt-4 shadow-lg duration-200 outline-none dark:bg-muted sm:h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-4rem)] sm:w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] sm:rounded-xl sm:pt-6 md:h-[calc(100vh-6rem)] md:max-h-[calc(100vh-6rem)] md:w-[calc(100vw-6rem)] md:max-w-[calc(100vw-6rem)]",
          THIN_BORDER_CLASS
        )}
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-sm:left-4 max-sm:right-auto sm:left-auto"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>

        <div className="flex shrink-0 flex-col space-y-1.5 px-3 pb-2 text-center sm:px-6 sm:text-left">
          <h2
            id="role-select-dialog-title"
            className="text-lg font-semibold leading-none tracking-tight"
          >
            {t("create.roleSelectDialog.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("create.roleSelectDialog.description")}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-4 sm:px-6 sm:pt-6">
          <div className="grid auto-rows-auto grid-cols-2 items-start gap-2 pb-4 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {CREATE_ROLES.map((role) => {
              const modelId = draftModels[role.id] ?? role.models[0]?.id ?? "";
              const isSelected = selectedKey === roleKey(role.id, modelId);
              const modelLabel =
                role.models.find((model) => model.id === modelId)?.label ??
                modelId;

              return (
                <div
                  key={role.id}
                  className={cn(
                    "group flex h-full flex-col rounded-xl border bg-background transition-colors dark:hover:shadow-none",
                    isSelected && "relative",
                    isSelected
                      ? "overflow-visible border-green-500 outline outline-1 outline-green-500 dark:border-green-500 dark:outline-green-500"
                      : "overflow-hidden border-border/60 dark:border-gray-700"
                  )}
                >
                  {isSelected && (
                    <div className="absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-lg">
                      {t("create.roleSelectDialog.selected")}
                    </div>
                  )}

                  <div
                    className="relative isolate flex flex-col justify-end overflow-hidden rounded-t-xl bg-gray-900 pb-3"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    <NextImage
                      src={role.cover}
                      alt={role.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="absolute inset-0 -z-10 h-full w-full object-cover"
                    />
                    <div className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-1 text-xs font-semibold text-white">
                      Role
                    </div>
                    <div className="absolute right-2 top-2 z-20 flex gap-1">
                      <button
                        type="button"
                        className="rounded-full bg-black/50 p-1.5 transition-colors hover:bg-black/70"
                        title={t("create.roleSelectDialog.viewInfo")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Info className="h-4 w-4 text-white" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-black/50 p-1.5 transition-colors hover:bg-black/70"
                        title={t("create.roleSelectDialog.addToFavorites")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Star className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate text-sm font-semibold leading-6 text-primary"
                        title={role.name}
                      >
                        {role.name}
                      </h3>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    </div>

                    <div className="mt-3 grid min-w-0 grid-cols-2 items-center gap-2">
                      <select
                        value={modelId}
                        onChange={(event) =>
                          setDraftModels((prev) => ({
                            ...prev,
                            [role.id]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-0 truncate rounded-xl border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        {role.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleSelect(role)}
                        className={cn(
                          "inline-flex h-9 w-full items-center justify-center rounded-xl px-3 py-1 text-sm font-medium shadow transition-colors",
                          PRIMARY_BUTTON_CLASS
                        )}
                      >
                        {t("create.roleSelectDialog.select")}
                      </button>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {t("create.roleSelectDialog.modelLabel")}
                      {modelLabel}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
