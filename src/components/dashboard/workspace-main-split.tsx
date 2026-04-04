'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_CHAT_PX = 280;
const MIN_KANBAN_PX = 280;
const DEFAULT_CHAT_PX = 440;

function storageWidthKey(workspaceId: string) {
  return `buddybubble.chatWidth.${workspaceId}`;
}

function storageCollapsedKey(workspaceId: string) {
  return `buddybubble.chatCollapsed.${workspaceId}`;
}

type Props = {
  workspaceId: string;
  /** Chat panel; receives onCollapse for the header control (e.g. ChatArea). */
  renderChat: (helpers: { onCollapse: () => void }) => React.ReactNode;
  board: React.ReactNode;
};

/**
 * Resizable split between chat and Kanban; chat can be fully collapsed to emphasize the board.
 * Width and collapsed state persist per workspace in localStorage.
 */
export function WorkspaceMainSplit({ workspaceId, renderChat, board }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_PX);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const c = localStorage.getItem(storageCollapsedKey(workspaceId));
      if (c === '1') setChatCollapsed(true);
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
      localStorage.setItem(storageCollapsedKey(workspaceId), chatCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [workspaceId, chatCollapsed, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageWidthKey(workspaceId), String(chatWidth));
    } catch {
      /* ignore */
    }
  }, [workspaceId, chatWidth, hydrated]);

  const collapseChat = useCallback(() => setChatCollapsed(true), []);
  const expandChat = useCallback(() => setChatCollapsed(false), []);

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

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-white',
          chatCollapsed && 'pointer-events-none w-0 min-w-0 flex-[0_0_0] border-transparent',
        )}
        style={chatCollapsed ? undefined : { flex: `0 0 ${chatWidth}px` }}
        aria-hidden={chatCollapsed}
      >
        {renderChat({ onCollapse: collapseChat })}
      </div>

      {!chatCollapsed && (
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

      {chatCollapsed && (
        <button
          type="button"
          onClick={expandChat}
          title="Show chat"
          aria-label="Show chat panel"
          className="flex h-full w-10 shrink-0 flex-col items-center border-r border-border bg-muted/20 py-3 text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-700"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{board}</div>
    </div>
  );
}
