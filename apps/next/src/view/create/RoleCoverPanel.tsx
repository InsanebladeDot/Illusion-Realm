"use client";

import { useState } from "react";
import { DEFAULT_SELECTED_ROLE } from "@/data/roles";
import { useTranslation } from "@/i18n";
import type { SelectedRole } from "@/types/role";
import { AudioUpload } from "@/view/create/AudioUpload";
import { RoleModelSelect } from "@/view/create/RoleModelSelect";
import { RoleSelectDialog } from "@/view/create/RoleSelectDialog";
import { SimpleGenerateFooter } from "@/view/create/SimpleGenerateFooter";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function RoleCoverPanel() {
  const { t } = useTranslation();
  const [selectedRole, setSelectedRole] =
    useState<SelectedRole>(DEFAULT_SELECTED_ROLE);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [referenceAudioName, setReferenceAudioName] = useState<string | null>(
    null
  );

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

          <div
            className={cn(
              "border-t px-2 pb-0 pt-2 sm:px-3 sm:pt-3",
              THIN_DIVIDER_CLASS
            )}
          >
            <AudioUpload
              label={t("create.roleCoverPanel.audioLabel")}
              required
              fileName={referenceAudioName}
              onSelect={(file) => setReferenceAudioName(file.name)}
              onRemove={() => setReferenceAudioName(null)}
              emptyHint={t("create.roleCoverPanel.audioEmptyHint")}
            />
          </div>
        </div>

        <SimpleGenerateFooter label={t("create.roleCoverPanel.generateCover")} />
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
