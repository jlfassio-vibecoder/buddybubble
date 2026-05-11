'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, Plus, UserPlus } from 'lucide-react';
import { setLastWorkspaceCookieClient } from '@/lib/workspace-cookies';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';

type Props = {
  workspaceId: string;
  pendingJoinRequestCount?: number;
  profileAvatarUrl?: string | null;
  profileName?: string | null;
  onOpenProfile?: () => void;
  onOpenPeopleInvites?: () => void;
  onOpenCreateWorkspace?: () => void;
  onOpenFitnessProfile?: () => void;
};

/**
 * Mobile drawer only: horizontal workspace icons + footer controls.
 * Desktop continues to use `WorkspaceRail`.
 */
export function MobileWorkspaceStrip({
  workspaceId,
  pendingJoinRequestCount = 0,
  profileAvatarUrl,
  profileName,
  onOpenProfile,
  onOpenPeopleInvites,
  onOpenCreateWorkspace,
  onOpenFitnessProfile,
}: Props) {
  const pathname = usePathname();
  const userWorkspaces = useWorkspaceStore((s) => s.userWorkspaces);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  const profileInitial =
    profileName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  return (
    <aside
      aria-label="BuddyBubbles"
      className="flex w-full shrink-0 flex-col border-b border-white/15 bg-[var(--rail-bg)]"
    >
      <nav
        aria-label="BuddyBubble list"
        className="flex h-16 w-full items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 [scrollbar-width:none] snap-x snap-proximity touch-pan-x [&::-webkit-scrollbar]:hidden"
      >
        {userWorkspaces.map((w) => {
          const href = `/app/${w.id}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const label = w.name.trim().slice(0, 1).toUpperCase() || '?';
          return (
            <Link
              key={w.id}
              href={href}
              title={w.name}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setLastWorkspaceCookieClient(w.id);
                setActiveWorkspaceId(w.id);
              }}
              className={cn(
                'relative z-0 flex h-12 w-12 shrink-0 snap-start items-center justify-center overflow-hidden rounded-[14px] text-sm font-semibold transition-all',
                active
                  ? 'rounded-[14px] bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)] ring-2 ring-inset ring-white'
                  : 'bg-white/15 text-[color:var(--sidebar-text)] ring-1 ring-inset ring-white/10 hover:rounded-[14px] hover:bg-[color:var(--sidebar-hover)] hover:text-white',
              )}
            >
              {w.icon_url ? (
                <img
                  src={w.icon_url}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                label
              )}
              {active ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 left-1/2 z-10 h-[3px] w-8 -translate-x-1/2 rounded-t-full bg-white shadow-[0_-2px_12px_rgba(255,255,255,0.18)]"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex h-14 w-full shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4">
        {workspaceId ? (
          onOpenPeopleInvites ? (
            <button
              type="button"
              onClick={onOpenPeopleInvites}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
              aria-label={
                pendingJoinRequestCount > 0
                  ? `Invite people — ${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? '' : 's'}`
                  : 'Invite people to this socialspace'
              }
              title={
                pendingJoinRequestCount > 0
                  ? `Invite & approvals (${pendingJoinRequestCount} pending)`
                  : 'Invite people'
              }
            >
              <UserPlus className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              {pendingJoinRequestCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-[color:var(--rail-bg)] bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                  {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                </span>
              ) : null}
            </button>
          ) : (
            <Link
              href={
                pendingJoinRequestCount > 0
                  ? `/app/${workspaceId}/invites?tab=pending`
                  : `/app/${workspaceId}/invites`
              }
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
              aria-label={
                pendingJoinRequestCount > 0
                  ? `Invite people — ${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? '' : 's'}`
                  : 'Invite people to this socialspace'
              }
              title={
                pendingJoinRequestCount > 0
                  ? `Invite & approvals (${pendingJoinRequestCount} pending)`
                  : 'Invite people'
              }
            >
              <UserPlus className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              {pendingJoinRequestCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-[color:var(--rail-bg)] bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                  {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                </span>
              ) : null}
            </Link>
          )
        ) : (
          <span className="shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <button
            type="button"
            title="Create a BuddyBubble"
            aria-label="Create a BuddyBubble"
            onClick={() => onOpenCreateWorkspace?.()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
          >
            <Plus className="h-6 w-6" strokeWidth={2.25} />
          </button>
          {onOpenFitnessProfile ? (
            <button
              type="button"
              title="Fitness Profile"
              aria-label="Open fitness profile"
              onClick={onOpenFitnessProfile}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
            >
              <Dumbbell className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
          {onOpenProfile ? (
            <button
              type="button"
              title="Profile"
              aria-label="Open profile"
              onClick={onOpenProfile}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white/10 ring-2 ring-inset ring-white/20 transition-colors hover:ring-white/40 motion-reduce:transition-none"
            >
              {profileAvatarUrl ? (
                <img
                  src={profileAvatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-[11px] font-semibold text-[color:var(--sidebar-text)]">
                  {profileInitial}
                </span>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
