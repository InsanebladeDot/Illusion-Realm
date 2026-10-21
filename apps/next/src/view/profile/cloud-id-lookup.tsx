"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS, CLOUD_INPUT_CLASS } from "@/utils/cloud-image-ui";

export function CloudIdLookup({ kind, busy, onLookup }: { kind: "image" | "collection"; busy: boolean; onLookup: (id: string) => void }) {
  const { t } = useTranslation();
  const [id, setId] = useState("");
  return <form onSubmit={event => { event.preventDefault(); if (/^[1-9][0-9]{0,19}$/.test(id)) onLookup(id); }} className="flex min-w-0 flex-wrap items-end gap-2">
    <label className="min-w-0 flex-1 space-y-1.5 text-sm"><span>{t(kind === "image" ? "profile.cloud.imageId" : "profile.cloud.collectionId")}</span>
      <input value={id} onChange={event => setId(event.target.value.trim())} inputMode="numeric" pattern="[1-9][0-9]{0,19}" maxLength={20} required disabled={busy} className={CLOUD_INPUT_CLASS} />
    </label>
    <button type="submit" disabled={busy || !/^[1-9][0-9]{0,19}$/.test(id)} className={CLOUD_BUTTON_CLASS}>{t(busy ? "profile.cloud.loading" : "profile.cloud.lookup")}</button>
  </form>;
}
