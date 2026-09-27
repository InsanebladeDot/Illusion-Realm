"use client";

import { useTranslation } from "@/i18n";

export default function ComicGeneratorPage() {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("toolBox.comic.title")}</h2>
      <p className="text-gray-500 mb-6">{t("toolBox.comic.description")}</p>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <p className="text-gray-400">{t("toolBox.comic.emptyHint")}</p>
      </div>
    </div>
  );
}