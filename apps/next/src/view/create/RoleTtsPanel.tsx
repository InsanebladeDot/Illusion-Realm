"use client";

import { useState } from "react";
import { DEFAULT_SELECTED_ROLE } from "@/data/roles";
import { useTranslation } from "@/i18n";
import type { SelectedRole } from "@/types/role";
import { AudioUpload } from "@/view/create/AudioUpload";
import { RoleModelSelect } from "@/view/create/RoleModelSelect";
import { RoleSelectDialog } from "@/view/create/RoleSelectDialog";
import { SimpleGenerateFooter } from "@/view/create/SimpleGenerateFooter";
import { INPUT_BORDER_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function RoleTtsPanel() {
  const { t } = useTranslation();
  const [selectedRole, setSelectedRole] =
    useState<SelectedRole>(DEFAULT_SELECTED_ROLE);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [text, setText] = useState("");
  const [referenceVoiceName, setReferenceVoiceName] = useState<string | null>(
    null
  );
  const [referenceVoiceText, setReferenceVoiceText] = useState("");

  return (
    <>
      <form className="flex min-h-0 flex-1 flex-col lg:h-full lg:flex lg:flex-col">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
          <div className="px-2 pt-2 sm:px-3 sm:pt-3">
            <RoleModelSelect
              value={selectedRole}
              onOpenDialog={() => setRoleDialogOpen(true)}
            />
          </div>

          <div className="space-y-4 px-2 py-2 sm:px-3 sm:py-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="role-tts-text">
                {t("create.roleTtsPanel.textLabel")}
              </label>
              <textarea
                id="role-tts-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                placeholder={t("create.roleTtsPanel.textPlaceholder")}
                className={cn(
                  "flex min-h-[100px] w-full resize-none rounded-md bg-transparent px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  INPUT_BORDER_CLASS
                )}
              />
            </div>

            <AudioUpload
              label={t("create.roleTtsPanel.audioLabel")}
              fileName={referenceVoiceName}
              onSelect={(file) => setReferenceVoiceName(file.name)}
              onRemove={() => setReferenceVoiceName(null)}
              emptyHint={t("create.roleTtsPanel.audioEmptyHint")}
            />

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="role-tts-reference-text"
              >
                {t("create.roleTtsPanel.referenceTextLabel")}
              </label>
              <textarea
                id="role-tts-reference-text"
                value={referenceVoiceText}
                onChange={(event) => setReferenceVoiceText(event.target.value)}
                rows={3}
                placeholder={t("create.roleTtsPanel.referenceTextPlaceholder")}
                className={cn(
                  "flex min-h-[80px] w-full resize-none rounded-md bg-transparent px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  INPUT_BORDER_CLASS
                )}
              />
            </div>
          </div>
        </div>

        <SimpleGenerateFooter label={t("create.roleTtsPanel.generateVoice")} />
      </form>

      <RoleSelectDialog
        open={roleDialogOpen}
        selected={selectedRole}
        onOpenChange={setRoleDialogOpen}
        onSelect={setSelectedRole}
      />
    </>
  );
}
