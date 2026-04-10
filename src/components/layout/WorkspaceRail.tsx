'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, Plus, UserPlus } from 'lucide-react';
import { setLastWorkspaceCookieClient } from '@/lib/workspace-cookies';
import { cn } from '@/lib/utils';
import { useWorkspaceStore, type WorkspaceRow } from '@/store/workspaceStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';

type Props = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** When both columns are collapsed, this rail fills the bottom half of the vertical stack. */
  collapsedStackSlot?: 'bottom';
  onOpenProfile?: () => void;
  profileAvatarUrl?: string | null;
  profileName?: string | null;
  /** Marketing iframe: hide workspace switcher, create workspace, and profile. */
  embedMode?: boolean;
  /** e.g. mobile sheet: hide collapse control (drawer closes via overlay). */
  hideRailCollapseButton?: boolean;
  /** Current route workspace — drives `/app/{id}/invites` link in the rail footer. */
  workspaceId?: string;
  /** Pending join requests badge (only non-zero for admins in `DashboardShell`). */
  pendingJoinRequestCount?: number;
  /** Opens People & invites in a modal (e.g. `DashboardShell`); falls back to `/invites` link when omitted. */
  onOpenPeopleInvites?: () => void;
  /** Opens Create BuddyBubble (e.g. `DashboardShell`); required for the + control when not in embed mode. */
  onOpenCreateWorkspace?: () => void;
};

function categoryRing(category: WorkspaceRow['category_type']): string {
  switch (category) {
    case 'business':
      return 'ring-[color:var(--sidebar-active)]/50';
    case 'kids':
      return 'ring-[color:var(--sidebar-active)]/55';
    case 'class':
      return 'ring-[color:var(--sidebar-active)]/50';
    case 'community':
      return 'ring-[color:var(--sidebar-active)]/50';
    default:
      return 'ring-white/30';
  }
}

export function WorkspaceRail({
  collapsed,
  onCollapsedChange,
  collapsedStackSlot,
  onOpenProfile,
  profileAvatarUrl,
  profileName,
  embedMode = false,
  hideRailCollapseButton = false,
  workspaceId,
  pendingJoinRequestCount = 0,
  onOpenPeopleInvites,
  onOpenCreateWorkspace,
}: Props) {
  const pathname = usePathname();
  const userWorkspaces = useWorkspaceStore((s) => s.userWorkspaces);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  const expand = useCallback(() => onCollapsedChange(false), [onCollapsedChange]);
  const collapse = useCallback(() => onCollapsedChange(true), [onCollapsedChange]);

  const profileInitial =
    profileName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const isStackedBottom = collapsed && collapsedStackSlot === 'bottom';
  const isCollapsedStrip = collapsed && collapsedStackSlot === undefined;

  return (
    <>
      <aside
        className={cn(
          /* Avoid overflow-hidden on the column — it can clip the footer invite/create/profile stack. */
          'flex min-h-0 flex-col bg-[var(--rail-bg)] transition-[width] duration-200 ease-out motion-reduce:transition-none',
          !collapsed && 'h-full w-[72px] shrink-0 border-r border-white/15 py-2',
          isCollapsedStrip &&
            cn('h-full shrink-0 border-r border-white/15 py-2', COLLAPSED_COLUMN_WIDTH_CLASS),
          isStackedBottom && 'min-h-0 flex-1 w-full border-0 py-2',
        )}
        aria-label="BuddyBubbles"
      >
        {collapsed ? (
          <CollapsedColumnStrip
            title="Workspace"
            expandTitle="Expand Workspace rail"
            expandAriaLabel="Expand Workspace rail"
            onExpand={expand}
            edge="left"
            variant="zinc"
          />
        ) : (
          <>
            {embedMode ? (
              <div className="min-h-0 flex-1" aria-hidden />
            ) : (
              <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                <nav
                  className="flex flex-col items-center gap-2 px-2"
                  aria-label="BuddyBubble list"
                >
                  {userWorkspaces.map((w) => {
                    const href = `/app/${w.id}`;
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    const label = w.name.trim().slice(0, 1).toUpperCase() || '?';
                    return (
                      <div key={w.id} className="relative flex w-full justify-center py-0.5">
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 z-10 h-10 w-[5px] -translate-y-1/2 rounded-r-full bg-white shadow-[2px_0_12px_rgba(255,255,255,0.12)]"
                            aria-hidden
                          />
                        )}
                        <Link
                          href={href}
                          title={w.name}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => {
                            setLastWorkspaceCookieClient(w.id);
                            setActiveWorkspaceId(w.id);
                          }}
                          className={cn(
                            'relative z-0 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] text-sm font-semibold transition-all',
                            'ring-2 ring-inset',
                            categoryRing(w.category_type),
                            active
                              ? 'rounded-[14px] bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                              : 'bg-white/15 text-[color:var(--sidebar-text)] hover:rounded-[14px] hover:bg-[color:var(--sidebar-hover)] hover:text-white',
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
                        </Link>
                      </div>
                    );
                  })}
                </nav>
              </ScrollArea>
            )}

            <div className="mt-auto flex shrink-0 flex-col items-center gap-2 border-t border-white/15 px-2 pt-2">
              {hideRailCollapseButton ? null : (
                <button
                  type="button"
                  title="Collapse Workspace rail"
                  aria-label="Collapse Workspace rail"
                  onClick={collapse}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/15 hover:text-white motion-reduce:transition-none"
                >
                  <PanelLeftClose className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              )}
              {!embedMode ? (
                <>
                  {workspaceId ? (
                    <div className="flex w-full flex-col items-center gap-1 border-b border-white/10 pb-2">
                      {onOpenPeopleInvites ? (
                        <button
                          type="button"
                          onClick={onOpenPeopleInvites}
                          className="relative flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
                          aria-label={
                            pendingJoinRequestCount > 0
                              ? `Invite people — ${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? '' : 's'}`
                              : 'Invite people to this workspace'
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
                          className="relative flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
                          aria-label={
                            pendingJoinRequestCount > 0
                              ? `Invite people — ${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? '' : 's'}`
                              : 'Invite people to this workspace'
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
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    title="Create a BuddyBubble"
                    aria-label="Create a BuddyBubble"
                    onClick={() => onOpenCreateWorkspace?.()}
                    className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/10 text-white/55 ring-2 ring-inset ring-white/20 transition-colors hover:bg-[color:var(--sidebar-active)] hover:text-[var(--primary-foreground)] hover:ring-[color:var(--sidebar-active)]/50 motion-reduce:transition-none"
                  >
                    <Plus className="h-6 w-6" strokeWidth={2.25} />
                  </button>
                  {onOpenProfile ? (
                    <button
                      type="button"
                      title="Profile"
                      aria-label="Open profile"
                      onClick={onOpenProfile}
                      className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] bg-white/10 ring-2 ring-inset ring-white/20 transition-colors hover:ring-white/40 motion-reduce:transition-none"
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
                </>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
