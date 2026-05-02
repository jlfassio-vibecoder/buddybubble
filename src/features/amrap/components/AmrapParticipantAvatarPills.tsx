'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import { cn } from '@/lib/utils';

export const MAX_VISIBLE_AVATARS = 3;

function getInitialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  const chars = [...t];
  if (chars.length === 0) return '?';
  if (chars.length === 1) return chars[0].toUpperCase();
  return `${chars[0]}${chars[1]}`.toUpperCase();
}

function participantTitle(p: AmrapParticipantEngine, includeRoundsInTitle: boolean): string {
  const base = `${p.name}${p.isSelf ? ' (you)' : ''}`;
  return includeRoundsInTitle ? `${base} (${p.rounds}r)` : base;
}

export function AmrapParticipantAvatarPills({
  participants,
  includeRoundsInTitle = false,
}: {
  participants: AmrapParticipantEngine[];
  /** When ties have different round counts, include rounds in each pill's native tooltip. */
  includeRoundsInTitle?: boolean;
}) {
  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = participants.length - visible.length;
  const hidden = overflow > 0 ? participants.slice(MAX_VISIBLE_AVATARS) : [];

  const overflowTitle =
    hidden.length > 0
      ? hidden.map((p) => participantTitle(p, includeRoundsInTitle)).join(', ')
      : undefined;

  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      {visible.map((p) => (
        <Avatar
          key={p.id}
          size="sm"
          title={participantTitle(p, includeRoundsInTitle)}
          className={cn(
            p.isSelf &&
              'ring-2 ring-primary ring-offset-2 ring-offset-background dark:ring-offset-background',
          )}
        >
          <AvatarFallback>{getInitialsFromDisplayName(p.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 ? (
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-1 ring-border"
          title={overflowTitle}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
