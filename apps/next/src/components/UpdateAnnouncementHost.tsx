"use client";

import { useEffect, useState } from "react";
import type { ChangelogSection } from "@/types/changelog";
import {
  fetchChangelogMarkdown,
  getLatestChangelogSection,
} from "@/utils/changelog";
import { useUpdatesStore } from "@/stores/useUpdatesStore";
import { UpdateAnnouncementDialog } from "@/view/updates/UpdateAnnouncementDialog";

export function UpdateAnnouncementHost() {
  const markChangelogSeen = useUpdatesStore((state) => state.markChangelogSeen);
  const [latestSection, setLatestSection] = useState<ChangelogSection | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(
    () => useUpdatesStore.persist.hasHydrated?.() ?? false
  );

  useEffect(() => {
    const finishHydration = () => setHydrated(true);
    const unsub = useUpdatesStore.persist.onFinishHydration(finishHydration);
    if (useUpdatesStore.persist.hasHydrated()) {
      finishHydration();
    }
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    void (async () => {
      try {
        const markdown = await fetchChangelogMarkdown();
        if (cancelled) return;
        const latest = getLatestChangelogSection(markdown);
        if (!latest) return;

        setLatestSection(latest);
        const seen = useUpdatesStore.getState().lastSeenChangelogSectionId;
        if (seen !== latest.id) {
          setOpen(true);
        }
      } catch {
        // 静默失败：无 public/changelog.md 时不弹窗
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const handleDismiss = () => {
    if (latestSection) {
      markChangelogSeen(latestSection.id);
    }
    setOpen(false);
  };

  return (
    <UpdateAnnouncementDialog
      open={open}
      section={latestSection}
      onDismiss={handleDismiss}
    />
  );
}
