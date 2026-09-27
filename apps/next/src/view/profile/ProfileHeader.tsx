"use client";

import Link from "next/link";
import { SquarePen } from "lucide-react";
import { useProfileStore } from "@/stores/useProfileStore";
import { useTranslation } from "@/i18n";
import { getProfileInitials } from "@/utils/profile";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type ProfileHeaderProps = {
  onEdit: () => void;
};

function StatItem({
  value,
  label,
  href,
}: {
  value: number;
  label: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="font-bold">{value}</span>
      <span className="ml-1 text-muted-foreground">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="transition-opacity hover:opacity-80">
        {content}
      </Link>
    );
  }

  return <span>{content}</span>;
}

function Avatar({
  username,
  avatarDataUrl,
  className,
}: {
  username: string;
  avatarDataUrl: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full border-background bg-muted shadow-lg",
        className
      )}
    >
      {avatarDataUrl ? (
        <img
          src={avatarDataUrl}
          alt={username}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-medium">
          {getProfileInitials(username)}
        </span>
      )}
    </span>
  );
}

export function ProfileHeader({ onEdit }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const username = useProfileStore((state) => state.username);
  const bio = useProfileStore((state) => state.bio);
  const avatarDataUrl = useProfileStore((state) => state.avatarDataUrl);
  const stats = useProfileStore((state) => state.stats);

  const editButton = (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted",
        INPUT_BORDER_CLASS
      )}
    >
      <SquarePen className="mr-1.5 h-3.5 w-3.5 md:mr-2 md:h-4 md:w-4" />
      {t("profile.edit.title")}
    </button>
  );

  const statsRow = (
    <div className="flex items-center gap-3 text-sm md:gap-4">
      <StatItem value={stats.posts} label={t("profile.stats.posts")} />
      <StatItem value={stats.followers} label={t("profile.stats.followers")} href="#" />
      <StatItem value={stats.following} label={t("profile.stats.following")} href="#" />
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-4 md:py-8">
      <div className="flex flex-col items-start gap-4 md:flex-row md:gap-8">
        <div className="w-full md:hidden">
          <div className="flex items-start gap-3">
            <Avatar
              username={username}
              avatarDataUrl={avatarDataUrl}
              className="h-20 w-20 border-2"
            />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h1 className="text-xl font-bold">{username}</h1>
                {editButton}
              </div>
              {statsRow}
              {bio ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {bio}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 md:block">
          <Avatar
            username={username}
            avatarDataUrl={avatarDataUrl}
            className="h-32 w-32 border-4 shadow-xl"
          />
        </div>

        <div className="hidden min-w-0 flex-1 space-y-4 md:block">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold">{username}</h1>
            {editButton}
          </div>
          {statsRow}
          {bio ? (
            <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {bio}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
