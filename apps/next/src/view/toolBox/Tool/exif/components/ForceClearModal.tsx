"use client";

import { ShieldAlert, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

type ForceClearModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 元数据结构不一致时的确认弹窗：强行统一清空 / 保留原样（仅重命名） */
export function ForceClearModal({
  open,
  onConfirm,
  onCancel,
}: ForceClearModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-4 border-b border-amber-100 bg-amber-50 p-6">
          <div className="rounded-full bg-amber-100 p-2">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-amber-900">
              {t("toolBox.exif.forceClearModal.title")}
            </h3>
            <p className="mt-1 text-sm text-amber-700">
              {t("toolBox.exif.forceClearModal.body")}
            </p>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-gray-600">
            {t("toolBox.exif.forceClearModal.choose")}{" "}
            <span className="font-semibold text-red-600">
              {t("toolBox.exif.forceClearModal.option")}
            </span>{" "}
            {t("toolBox.exif.forceClearModal.willDo")}
          </p>
          <ul className="list-inside list-disc space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <li>{t("toolBox.exif.forceClearModal.removeAll")}</li>
            <li>{t("toolBox.exif.forceClearModal.switchToAdd")}</li>
            <li>{t("toolBox.exif.forceClearModal.reAdd")}</li>
          </ul>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t("toolBox.exif.forceClearModal.cancelKeep")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              {t("toolBox.exif.forceClearModal.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
