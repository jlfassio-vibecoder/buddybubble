'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';

const MIN_CHAT_PX = 280;
const MIN_KANBAN_PX = 280;
const DEFAULT_CHAT_PX = 440;

function storageWidthKey(workspaceId: string) {
  return `buddybubble.chatWidth.${workspaceId}`;
}

type Props = {
  workspaceId: string;
  chatCollapsed: boolean;
  onChatCollapsedChange: (collapsed: boolean) => void;
  kanbanCollapsed: boolean;
  /** When the shell renders the Messages strip in the left stack, hide the duplicate strip here. */
  omitCollapsedMessagesStrip?: boolean;
  /** Chat panel; receives onCollapse for the header control (e.g. ChatArea). */
  renderChat: (helpers: { onCollapse: () => void }) => React.ReactNode;
  board: React.ReactNode;
};

/**
 * Resizable split between chat and Kanban; chat can be fully collapsed to emphasize the board.
 * Chat width persists per workspace in localStorage; collapsed state is controlled by the parent.
 *
 * When Kanban is collapsed: only Messages (chat) is shown in this area — no Kanban strip here
 * (the strip may appear in the shell rail). User opens Kanban again by collapsing Messages.
 */
export function WorkspaceMainSplit({
  workspaceId,
  chatCollapsed,
  onChatCollapsedChange,
  kanbanCollapsed,
  omitCollapsedMessagesStrip = false,
  renderChat,
  board,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_PX);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const w = localStorage.getItem(storageWidthKey(workspaceId));
      if (w) {
        const n = Number.parseInt(w, 10);
        if (!Number.isNaN(n) && n >= MIN_CHAT_PX) setChatWidth(n);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageWidthKey(workspaceId), String(chatWidth));
    } catch {
      /* ignore */
    }
  }, [workspaceId, chatWidth, hydrated]);

  const collapseChat = useCallback(() => onChatCollapsedChange(true), [onChatCollapsedChange]);
  const expandChat = useCallback(() => onChatCollapsedChange(false), [onChatCollapsedChange]);

  /** Kanban is hidden: Messages fills the main split (no strip beside chat here). */
  const messagesOnlyMain = !chatCollapsed && kanbanCollapsed;
  /** Both panels visible: resizable split. */
  const splitChatAndBoard = !chatCollapsed && !kanbanCollapsed;

  useEffect(() => {
    const clamp = () => {
      const total = containerRef.current?.clientWidth ?? 0;
      if (total <= 0) return;
      const maxW = Math.max(MIN_CHAT_PX, total - MIN_KANBAN_PX);
      setChatWidth((w) => Math.min(w, maxW));
    };
    window.addEventListener('resize', clamp);
    clamp();
    return () => window.removeEventListener('resize', clamp);
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = chatWidth;

      const onMove = (ev: PointerEvent) => {
        const total = containerRef.current?.clientWidth ?? 0;
        const maxW = Math.max(MIN_CHAT_PX, total - MIN_KANBAN_PX);
        const delta = ev.clientX - startX;
        setChatWidth(Math.min(maxW, Math.max(MIN_CHAT_PX, startW + delta)));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [chatWidth],
  );

  const showMessagesStrip = chatCollapsed && !omitCollapsedMessagesStrip;

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-white',
          chatCollapsed && 'pointer-events-none w-0 min-w-0 flex-[0_0_0] border-transparent',
          messagesOnlyMain && 'min-w-0 flex-1',
        )}
        style={
          chatCollapsed ? undefined : messagesOnlyMain ? undefined : { flex: `0 0 ${chatWidth}px` }
        }
        aria-hidden={chatCollapsed}
      >
        {renderChat({ onCollapse: collapseChat })}
      </div>

      {splitChatAndBoard && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          className="group relative w-2 shrink-0 cursor-col-resize border-r border-border bg-muted/30 hover:bg-indigo-100/40"
          onPointerDown={handleResizePointerDown}
        >
          <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-indigo-300" />
        </div>
      )}

      {showMessagesStrip && (
        <div
          className={cn(
            'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-black',
            COLLAPSED_COLUMN_WIDTH_CLASS,
          )}
        >
          <CollapsedColumnStrip
            title="Messages"
            expandTitle="Expand Messages"
            expandAriaLabel="Expand Messages panel"
            onExpand={expandChat}
            variant="black"
          />
        </div>
      )}

      {!kanbanCollapsed && <div className="flex min-h-0 min-w-0 flex-1 flex-col">{board}</div>}
    </div>
  );
}
