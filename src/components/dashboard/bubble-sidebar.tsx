'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Lock, PanelLeftClose, Settings, Settings2, Sparkles, Users } from 'lucide-react';
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
import { usePresenceStore, type UserPresence } from '@/store/presenceStore';
import { useUserProfileStore } from '@/store/userProfileStore';

type BubbleTab = 'main' | 'trials' | 'members';

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
  /** Matches `bubbles_insert` / workspace members — not bubble_editor alone. */
  canCreateWorkspaceBubble: boolean;
  /** Owner/admin — per-bubble settings (matches invites page policy). */
  isAdmin?: boolean;
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
  canCreateWorkspaceBubble,
  isAdmin = false,
  onOpenWorkspaceSettings,
  hideSidebarCollapseButton = false,
  workspaceTitle,
}: Props) {
  const [activeTab, setActiveTab] = useState<BubbleTab>('main');
  const initialTabSyncDoneRef = useRef(false);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [bubbleSettingsId, setBubbleSettingsId] = useState<string | null>(null);

  /** One-time: align default tab with the selected bubble’s bucket (admin only). */
  useEffect(() => {
    if (!isAdmin || initialTabSyncDoneRef.current) return;
    if (selectedBubbleId == null || selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) {
      initialTabSyncDoneRef.current = true;
      return;
    }
    const b = bubbles.find((x) => x.id === selectedBubbleId);
    if (b) {
      if (b.bubble_type === 'trial') setActiveTab('trials');
      else if (b.bubble_type === 'dm') setActiveTab('members');
      initialTabSyncDoneRef.current = true;
      return;
    }
    if (bubbles.length > 0) {
      initialTabSyncDoneRef.current = true;
    }
  }, [isAdmin, selectedBubbleId, bubbles]);

  const visibleBubbles = useMemo(() => {
    if (!isAdmin) return bubbles;
    switch (activeTab) {
      case 'trials':
        return bubbles.filter((b) => b.bubble_type === 'trial');
      case 'members':
        return bubbles.filter((b) => b.bubble_type === 'dm');
      case 'main':
      default:
        return bubbles.filter((b) => b.bubble_type !== 'trial' && b.bubble_type !== 'dm');
    }
  }, [bubbles, activeTab, isAdmin]);

  const myId = useUserProfileStore((s) => s.profile?.id);
  const presenceUsers = usePresenceStore((s) => s.users);
  const peersByBubbleId = useMemo(() => {
    const m = new Map<string, UserPresence[]>();
    for (const u of presenceUsers.values()) {
      if (u.user_id === myId) continue;
      if (u.focus_type !== 'bubble' || !u.focus_id) continue;
      const list = m.get(u.focus_id) ?? [];
      list.push(u);
      m.set(u.focus_id, list);
    }
    return m;
  }, [presenceUsers, myId]);

  const activeBubbleForSettings = bubbles.find((b) => b.id === bubbleSettingsId) ?? null;

  const collapse = () => onCollapsedChange(true);
  const expand = () => onCollapsedChange(false);

  const isStackedInColumn =
    collapsed && (collapsedStackSlot === 'top' || collapsedStackSlot === 'middle');
  const isCollapsedStrip = collapsed && collapsedStackSlot === undefined;

  async function addBubble(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !canCreateWorkspaceBubble) return;
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
          /* Do not use overflow-hidden here — it clips the header workspace-settings control on the right. */
          'flex min-h-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none',
          !collapsed &&
            'h-full w-[302px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
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
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
                    Bubbles
                  </h2>
                  {onOpenWorkspaceSettings && isAdmin ? (
                    <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={onOpenWorkspaceSettings}
                        className="rounded-md p-1 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        aria-label="Socialspace settings"
                        title="Socialspace settings"
                      >
                        <Settings className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {canCreateWorkspaceBubble && (
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
              {isAdmin ? (
                <div
                  className="mt-2 flex h-9 w-full gap-0.5 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-0.5"
                  role="group"
                  aria-label="Bubble list scope"
                >
                  <button
                    type="button"
                    onClick={() => setActiveTab('main')}
                    aria-pressed={activeTab === 'main'}
                    className={cn(
                      'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 text-xs font-medium transition-colors',
                      activeTab === 'main'
                        ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                        : 'text-sidebar-foreground/80 hover:bg-[color:var(--sidebar-hover)]',
                    )}
                  >
                    <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Main</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('trials')}
                    aria-pressed={activeTab === 'trials'}
                    className={cn(
                      'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 text-xs font-medium transition-colors',
                      activeTab === 'trials'
                        ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                        : 'text-sidebar-foreground/80 hover:bg-[color:var(--sidebar-hover)]',
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Trials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    aria-pressed={activeTab === 'members'}
                    className={cn(
                      'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 text-xs font-medium transition-colors',
                      activeTab === 'members'
                        ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                        : 'text-sidebar-foreground/80 hover:bg-[color:var(--sidebar-hover)]',
                    )}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Members</span>
                  </button>
                </div>
              ) : null}
            </div>
            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              {isAdmin && activeTab === 'trials' ? (
                <div className="flex items-center gap-2 border-b border-sidebar-border/60 px-2 pb-2 pt-2">
                  <Input
                    className="h-8 flex-1 text-sm"
                    placeholder="Search trial leads (coming soon)"
                    disabled
                    readOnly
                  />
                  <Button type="button" size="sm" variant="outline" className="shrink-0" disabled>
                    Sort
                  </Button>
                </div>
              ) : null}
              <ul className="p-2">
                {(!isAdmin || activeTab === 'main') && (
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
                )}
                {visibleBubbles.map((b) => {
                  const bubblePeers = peersByBubbleId.get(b.id) ?? [];
                  return (
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
                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                        {bubblePeers.length > 0 ? (
                          <span
                            className="flex shrink-0 items-center gap-0.5"
                            title={bubblePeers.map((p) => p.name).join(', ')}
                          >
                            {bubblePeers.slice(0, 3).map((p) => (
                              <span
                                key={p.user_id}
                                className="size-2 shrink-0 rounded-full ring-1 ring-background"
                                style={{ backgroundColor: p.color }}
                              />
                            ))}
                            {bubblePeers.length > 3 ? (
                              <span className="text-[9px] font-medium text-sidebar-foreground/80">
                                +{bubblePeers.length - 3}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBubbleSettingsId(b.id);
                          }}
                          className={cn(
                            'absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
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
                  );
                })}
                {bubbles.length === 0 && (
                  <li className="px-2 py-4 text-sm text-sidebar-foreground/70">No bubbles yet.</li>
                )}
                {isAdmin &&
                  bubbles.length > 0 &&
                  visibleBubbles.length === 0 &&
                  activeTab === 'main' && (
                    <li className="px-2 py-4 text-sm text-sidebar-foreground/70">
                      No community channels yet.
                    </li>
                  )}
                {isAdmin &&
                  bubbles.length > 0 &&
                  visibleBubbles.length === 0 &&
                  activeTab === 'trials' && (
                    <li className="px-2 py-4 text-sm text-sidebar-foreground/70">
                      No trial bubbles yet.
                    </li>
                  )}
                {isAdmin &&
                  bubbles.length > 0 &&
                  visibleBubbles.length === 0 &&
                  activeTab === 'members' && (
                    <li className="px-2 py-4 text-sm text-sidebar-foreground/70">
                      No 1:1 client bubbles yet.
                    </li>
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
