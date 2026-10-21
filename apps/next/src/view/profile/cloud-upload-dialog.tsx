"use client";

import type { CloudImage } from "@illusion-realm/shared";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useTranslation } from "@/i18n";
import { CloudUploadForm } from "./cloud-upload-form";
import { useCloudUpload } from "./use-cloud-upload";

interface UploadDialogProps { ownerId: string; open: boolean; onOpenChange: (value: boolean) => void; onUploaded: (image: CloudImage) => void }

export function CloudUploadDialog({ ownerId, open, onOpenChange, onUploaded }: UploadDialogProps) {
  const { t } = useTranslation();
  // 草稿留在弹窗外壳之外；关闭、切换标签都不卸载此 hook，失败重试继续使用同一个 requestId。
  const state = useCloudUpload(ownerId, onUploaded);
  return <ResourceDialogShell open={open} onOpenChange={onOpenChange} title={t("profile.cloud.upload")} titleId="cloud-upload-title" bodyClassName="pb-6">
    <div className="mx-auto w-full max-w-xl"><CloudUploadForm state={state} /></div>
  </ResourceDialogShell>;
}
