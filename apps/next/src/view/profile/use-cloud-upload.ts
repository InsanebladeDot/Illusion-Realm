"use client";

// 上传表单只维护一次提交的快照；失败复用 UUID，任何表单修改都会开始新提交。
import { useEffect, useRef, useState } from "react";
import type { CloudImage, CloudImageUpload } from "@illusion-realm/shared";
import { readCloudPng, uploadCloudImage } from "@/api/cloud-images";
import { cloudRetrySeconds } from "@/utils/cloud-image-ui";

interface UploadDraft { file: File | null; title: string; visibility: CloudImageUpload["visibility"]; presentationMode: CloudImageUpload["presentationMode"] }
export type CloudUploadState = ReturnType<typeof useCloudUpload>;
export function useCloudUpload(ownerId: string, onUploaded: (image: CloudImage) => void) {
  const [draft, setDraft] = useState<UploadDraft>({ file: null, title: "", visibility: "private", presentationMode: "imageOnly" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const submission = useRef<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  function change(patch: Partial<UploadDraft>) {
    if (inFlight.current) return;
    submission.current = null; setError(null); setSuccess(false); setDraft(value => ({ ...value, ...patch }));
  }
  async function submit() {
    if (!draft.file || inFlight.current || cooldown || success || !draft.title.trim()) return;
    inFlight.current = true; setBusy(true); setError(null); setSuccess(false);
    submission.current ??= crypto.randomUUID();
    try {
      const bytes = await readCloudPng(draft.file);
      if (!alive.current) return;
      const image = await uploadCloudImage({ ...draft, bytes, ownerId, requestId: submission.current, fileName: draft.file.name });
      if (alive.current) { onUploaded(image); setSuccess(true); }
    } catch (failure) {
      if (alive.current) { setError(failure); setCooldown(cloudRetrySeconds(failure)); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return { draft, change, submit, busy, error, success, cooldown };
}
