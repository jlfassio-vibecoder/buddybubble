'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Plus } from 'lucide-react';
import { setLastWorkspaceCookieClient } from '@/lib/workspace-cookies';
import { cn } from '@/lib/utils';
import { useWorkspaceStore, type WorkspaceRow } from '@/store/workspaceStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CreateWorkspaceModal } from '@/components/modals/CreateWorkspaceModal';
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
};

function categoryRing(category: WorkspaceRow['category_type']): string {
  switch (category) {
    case 'business':
      return 'ring-indigo-400/45';
    case 'kids':
      return 'ring-pink-400/45';
    case 'class':
      return 'ring-amber-400/45';
    case 'community':
      return 'ring-emerald-400/45';
    default:
      return 'ring-zinc-500/35';
  }
}

export function WorkspaceRail({
  collapsed,
  onCollapsedChange,
  collapsedStackSlot,
  onOpenProfile,
  profileAvatarUrl,
  profileName,
}: Props) {
  const pathname = usePathname();
  const userWorkspaces = useWorkspaceStore((s) => s.userWorkspaces);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const [createOpen, setCreateOpen] = useState(false);

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
          'flex min-h-0 flex-col overflow-hidden bg-zinc-950 transition-[width] duration-200 ease-out',
          !collapsed && 'h-full w-[72px] shrink-0 border-r border-zinc-800 py-2',
          isCollapsedStrip &&
            cn('h-full shrink-0 border-r border-zinc-800 py-2', COLLAPSED_COLUMN_WIDTH_CLASS),
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
            variant="zinc"
          />
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              <nav className="flex flex-col items-center gap-2 px-2" aria-label="BuddyBubble list">
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
                            ? 'rounded-[14px] bg-zinc-700 text-white'
                            : 'bg-zinc-800 text-zinc-100 hover:rounded-[14px] hover:bg-emerald-600',
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

            <div className="mt-auto flex shrink-0 flex-col items-center gap-2 border-t border-zinc-800/80 px-2 pt-2">
              <button
                type="button"
                title="Collapse Workspace rail"
                aria-label="Collapse Workspace rail"
                onClick={collapse}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <ChevronLeft className="size-4" strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                title="Create a BuddyBubble"
                aria-label="Create a BuddyBubble"
                onClick={() => setCreateOpen(true)}
                className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-zinc-900 text-zinc-500 ring-2 ring-inset ring-zinc-700/80 transition-colors hover:bg-emerald-600 hover:text-white hover:ring-emerald-500/60"
              >
                <Plus className="h-6 w-6" strokeWidth={2.25} />
              </button>
              {onOpenProfile && (
                <button
                  type="button"
                  title="Profile"
                  aria-label="Open profile"
                  onClick={onOpenProfile}
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] bg-zinc-900 ring-2 ring-inset ring-zinc-700/80 transition-colors hover:ring-zinc-500"
                >
                  {profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-[11px] font-semibold text-zinc-300">
                      {profileInitial}
                    </span>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </aside>

      <CreateWorkspaceModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
