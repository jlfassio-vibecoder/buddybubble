'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hash, Lock, PanelLeftClose, Settings, Settings2, UserPlus } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';
import { ALL_BUBBLES_BUBBLE_ID, ALL_BUBBLES_LABEL } from '@/lib/all-bubbles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';
import { BubbleSettingsModal } from '@/components/modals/BubbleSettingsModal';

type Props = {
  workspaceId: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** In a vertical stack: top = two-strip layout; middle = three-strip (Messages above). */
  collapsedStackSlot?: 'top' | 'middle';
  bubbles: BubbleRow[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string) => void;
  onBubblesChange: (rows: BubbleRow[]) => void;
  canWrite: boolean;
  isAdmin?: boolean;
  /** Pending invitation_join_requests count; drives UserPlus badge and default invites tab. */
  pendingJoinRequestCount?: number;
  onOpenWorkspaceSettings?: () => void;
  /** e.g. mobile sheet: hide header collapse control. */
  hideSidebarCollapseButton?: boolean;
  /** Centered above the "Bubbles" heading — current BuddyBubble (workspace) name, not channel. */
  workspaceTitle?: string;
};

export function BubbleSidebar({
  workspaceId,
  collapsed,
  onCollapsedChange,
  collapsedStackSlot,
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onBubblesChange,
  canWrite,
  isAdmin = false,
  pendingJoinRequestCount = 0,
  onOpenWorkspaceSettings,
  hideSidebarCollapseButton = false,
  workspaceTitle,
}: Props) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [bubbleSettingsId, setBubbleSettingsId] = useState<string | null>(null);

  const activeBubbleForSettings = bubbles.find((b) => b.id === bubbleSettingsId) ?? null;

  const collapse = () => onCollapsedChange(true);
  const expand = () => onCollapsedChange(false);

  const isStackedInColumn =
    collapsed && (collapsedStackSlot === 'top' || collapsedStackSlot === 'middle');
  const isCollapsedStrip = collapsed && collapsedStackSlot === undefined;

  async function addBubble(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !canWrite) return;
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bubbles')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        icon: null,
      })
      .select('*')
      .single();
    setAdding(false);
    if (!error && data) {
      onBubblesChange([...bubbles, data as BubbleRow]);
      onSelectBubble((data as BubbleRow).id);
      setName('');
    }
  }

  return (
    <>
      <aside
        className={cn(
          'flex min-h-0 flex-col overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none',
          !collapsed &&
            'h-full w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
          isCollapsedStrip &&
            cn(
              'h-full shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
              COLLAPSED_COLUMN_WIDTH_CLASS,
            ),
          isStackedInColumn && 'min-h-0 flex-1 w-full border-0 border-b border-border bg-card',
        )}
        aria-label="Bubbles"
      >
        {collapsed ? (
          <CollapsedColumnStrip
            title="Bubbles"
            expandTitle="Expand Bubbles sidebar"
            expandAriaLabel="Expand Bubbles sidebar"
            onExpand={expand}
            edge="left"
            variant={isStackedInColumn ? 'card' : 'sidebar'}
          />
        ) : (
          <>
            <div className="border-b border-sidebar-border p-3">
              {workspaceTitle ? (
                <p
                  className="mb-2 truncate px-1 text-center text-xs font-semibold text-sidebar-foreground"
                  title={workspaceTitle}
                >
                  {workspaceTitle}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                {hideSidebarCollapseButton ? null : (
                  <button
                    type="button"
                    title="Collapse Bubbles sidebar"
                    aria-label="Collapse Bubbles sidebar"
                    onClick={collapse}
                    className="shrink-0 rounded-md p-1 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <PanelLeftClose className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                )}
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
                    Bubbles
                  </h2>
                  {isAdmin ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Link
                        href={
                          pendingJoinRequestCount > 0
                            ? `/app/${workspaceId}/invites?tab=pending`
                            : `/app/${workspaceId}/invites`
                        }
                        className="relative rounded-md p-1 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                        <UserPlus className="size-4" strokeWidth={2.25} aria-hidden />
                        {pendingJoinRequestCount > 0 ? (
                          <span className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-sidebar bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                            {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                          </span>
                        ) : null}
                      </Link>
                      {onOpenWorkspaceSettings ? (
                        <button
                          type="button"
                          onClick={onOpenWorkspaceSettings}
                          className="rounded-md p-1 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          aria-label="Workspace settings"
                          title="Workspace settings"
                        >
                          <Settings className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {canWrite && (
                <form onSubmit={addBubble} className="mt-2 flex gap-2">
                  <Input
                    placeholder="New bubble"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={adding || !name.trim()}>
                    Add
                  </Button>
                </form>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              <ul className="p-2">
                <li key={ALL_BUBBLES_BUBBLE_ID}>
                  <button
                    type="button"
                    onClick={() => onSelectBubble(ALL_BUBBLES_BUBBLE_ID)}
                    className={cn(
                      'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors',
                      selectedBubbleId === ALL_BUBBLES_BUBBLE_ID
                        ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                        : 'text-sidebar-foreground hover:bg-[color:var(--sidebar-hover)]',
                    )}
                  >
                    <Hash className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    {ALL_BUBBLES_LABEL}
                  </button>
                </li>
                {bubbles.map((b) => (
                  <li key={b.id} className="group relative mb-1">
                    <button
                      type="button"
                      onClick={() => onSelectBubble(b.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors',
                        selectedBubbleId === b.id
                          ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                          : 'text-sidebar-foreground hover:bg-[color:var(--sidebar-hover)]',
                        // leave room for the settings button on the right when admin
                        isAdmin && 'pr-8',
                      )}
                    >
                      {b.is_private ? (
                        <Lock className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      ) : (
                        <Hash className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      )}
                      <span className="min-w-0 truncate">{b.name}</span>
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBubbleSettingsId(b.id);
                        }}
                        className={cn(
                          'absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                          selectedBubbleId === b.id
                            ? 'text-[var(--primary-foreground)]/70 hover:text-[var(--primary-foreground)]'
                            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
                        )}
                        aria-label={`Settings for ${b.name}`}
                        title={`Settings for ${b.name}`}
                      >
                        <Settings2 className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
                {bubbles.length === 0 && (
                  <li className="px-2 py-4 text-sm text-sidebar-foreground/70">No bubbles yet.</li>
                )}
              </ul>
            </ScrollArea>
          </>
        )}
      </aside>

      {/* Bubble settings modal — rendered outside the aside so it overlays the full screen */}
      {isAdmin && activeBubbleForSettings ? (
        <BubbleSettingsModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setBubbleSettingsId(null);
          }}
          workspaceId={workspaceId}
          bubbleId={activeBubbleForSettings.id}
          bubbleName={activeBubbleForSettings.name}
          isPrivate={activeBubbleForSettings.is_private}
          onSaved={(updates) => {
            const updated = bubbles.map((b) =>
              b.id === activeBubbleForSettings.id
                ? {
                    ...b,
                    ...(updates.name !== undefined ? { name: updates.name } : {}),
                    ...(updates.isPrivate !== undefined ? { is_private: updates.isPrivate } : {}),
                  }
                : b,
            );
            onBubblesChange(updated);
            setBubbleSettingsId(null);
          }}
        />
      ) : null}
    </>
  );
}
