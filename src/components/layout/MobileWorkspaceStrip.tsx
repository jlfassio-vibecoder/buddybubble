'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, Plus, UserPlus, X } from 'lucide-react';
import { setLastWorkspaceCookieClient } from '@/lib/workspace-cookies';
import { categoryRailRingClass } from '@/lib/theme-engine/category-rail-ring';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';

type Props = {
  workspaceId: string;
  currentWorkspaceName: string;
  onClose?: () => void;
  onWorkspaceNavigate?: () => void;
  pendingJoinRequestCount?: number;
  profileAvatarUrl?: string | null;
  profileName?: string | null;
  onOpenProfile?: () => void;
  onOpenPeopleInvites?: () => void;
  onOpenCreateWorkspace?: () => void;
  onOpenFitnessProfile?: () => void;
};

const ACTION_TILE_CLASS =
  'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none';

function initialsFromName(name: string, maxChars = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, maxChars).toUpperCase();
  return parts
    .slice(0, maxChars)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function workspaceShortLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 8) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  return firstWord.length <= 12 ? firstWord : `${firstWord.slice(0, 11)}…`;
}

function useHorizontalScrollFade<T extends HTMLElement>(ref: RefObject<T | null>, deps: unknown) {
  const [canScrollRight, setCanScrollRight] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      setCanScrollRight(el.scrollWidth > el.clientWidth + 1);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [deps, ref]);

  return canScrollRight;
}

function LabeledAction({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-12 shrink-0 flex-col items-center gap-0.5', className)}>
      {children}
      <span className="max-w-[3rem] truncate text-center text-[10px] leading-tight text-white/70">
        {label}
      </span>
    </div>
  );
}

/**
 * Mobile drawer only: horizontal workspace icons + footer controls.
 * Desktop continues to use `WorkspaceRail`.
 */
export function MobileWorkspaceStrip({
  workspaceId,
  currentWorkspaceName,
  onClose,
  onWorkspaceNavigate,
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
  const workspaceScrollRef = useRef<HTMLElement>(null);
  const actionsScrollRef = useRef<HTMLElement>(null);

  const workspaceScrollFade = useHorizontalScrollFade(workspaceScrollRef, userWorkspaces.length);
  const actionsScrollFade = useHorizontalScrollFade(actionsScrollRef, [
    workspaceId,
    !!onOpenFitnessProfile,
    !!onOpenProfile,
    pendingJoinRequestCount,
  ]);

  const profileInitial = initialsFromName(profileName ?? '');

  const inviteAriaLabel =
    pendingJoinRequestCount > 0
      ? `Invite people — ${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? '' : 's'}`
      : 'Invite people to this socialspace';

  return (
    <aside
      aria-label="BuddyBubbles"
      className="flex w-full shrink-0 flex-col border-b border-white/15 bg-[var(--rail-bg)]"
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 pb-2 pt-[max(0.25rem,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
            Socialspaces
          </p>
          <p className="truncate text-sm font-semibold text-white" title={currentWorkspaceName}>
            {currentWorkspaceName}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 motion-reduce:transition-none"
            aria-label="Close menu"
          >
            <X className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="relative px-4 pb-1 pt-1">
        <nav
          ref={workspaceScrollRef}
          aria-label="BuddyBubble list"
          className={cn(
            'flex min-h-[4.5rem] w-full items-start gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] snap-x snap-proximity touch-pan-x [&::-webkit-scrollbar]:hidden',
            workspaceScrollFade &&
              '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]',
          )}
        >
          {userWorkspaces.map((w) => {
            const href = `/app/${w.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const tileInitials = initialsFromName(w.name);
            const shortLabel = workspaceShortLabel(w.name);
            return (
              <Link
                key={w.id}
                href={href}
                title={w.name}
                aria-label={w.name}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setLastWorkspaceCookieClient(w.id);
                  setActiveWorkspaceId(w.id);
                  onWorkspaceNavigate?.();
                }}
                className="relative z-0 flex w-12 shrink-0 snap-start flex-col items-center gap-0.5"
              >
                <span
                  className={cn(
                    'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] text-sm font-semibold transition-all ring-2 ring-inset',
                    active
                      ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)] ring-white'
                      : cn(
                          'bg-white/15 text-[color:var(--sidebar-text)] hover:bg-[color:var(--sidebar-hover)] hover:text-white',
                          categoryRailRingClass(w.category_type),
                        ),
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
                    tileInitials
                  )}
                  {active ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-0 left-1/2 z-10 h-[3px] w-8 -translate-x-1/2 rounded-t-full bg-white shadow-[0_-2px_12px_rgba(255,255,255,0.18)]"
                    />
                  ) : null}
                </span>
                <span className="max-w-[3rem] truncate text-center text-[10px] leading-tight text-white/70">
                  {shortLabel}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 px-4 pb-2 pt-2">
        <nav
          ref={actionsScrollRef}
          aria-label="Socialspace actions"
          className={cn(
            'flex w-full items-start gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] snap-x snap-proximity touch-pan-x [&::-webkit-scrollbar]:hidden',
            actionsScrollFade &&
              '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]',
          )}
        >
          {workspaceId ? (
            onOpenPeopleInvites ? (
              <LabeledAction label="Invite">
                <button
                  type="button"
                  onClick={onOpenPeopleInvites}
                  className={ACTION_TILE_CLASS}
                  aria-label={inviteAriaLabel}
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
              </LabeledAction>
            ) : (
              <LabeledAction label="Invite">
                <Link
                  href={
                    pendingJoinRequestCount > 0
                      ? `/app/${workspaceId}/invites?tab=pending`
                      : `/app/${workspaceId}/invites`
                  }
                  className={ACTION_TILE_CLASS}
                  aria-label={inviteAriaLabel}
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
              </LabeledAction>
            )
          ) : null}
          <LabeledAction label="New">
            <button
              type="button"
              title="Create a BuddyBubble"
              aria-label="Create a BuddyBubble"
              onClick={() => onOpenCreateWorkspace?.()}
              className={ACTION_TILE_CLASS}
            >
              <Plus className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
          </LabeledAction>
          {onOpenFitnessProfile ? (
            <LabeledAction label="Fitness">
              <button
                type="button"
                title="Fitness Profile"
                aria-label="Open fitness profile"
                onClick={onOpenFitnessProfile}
                className={ACTION_TILE_CLASS}
              >
                <Dumbbell className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              </button>
            </LabeledAction>
          ) : null}
          {onOpenProfile ? (
            <LabeledAction label="You">
              <button
                type="button"
                title="Profile"
                aria-label="Open profile"
                onClick={onOpenProfile}
                className={cn(ACTION_TILE_CLASS, 'overflow-hidden hover:ring-white/40')}
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
            </LabeledAction>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
