'use client';

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';
import type { CalendarRailProps } from '@/components/dashboard/calendar-rail';
import { TrialPaywallGuard } from '@/components/subscription/trial-paywall-guard';

const MIN_CHAT_PX = 280;
const MIN_KANBAN_PX = 280;
const DEFAULT_CHAT_PX = 440;
/** Room for calendar strip (`w-8`) vs expanded rail (`min-w-[16rem]` on `CalendarRail`). */
function calendarSideReservePx(calendarCollapsed: boolean): number {
  return calendarCollapsed ? 32 : 256;
}

function storageWidthKey(workspaceId: string) {
  return `buddybubble.chatWidth.${workspaceId}`;
}

type Props = {
  workspaceId: string;
  chatCollapsed: boolean;
  onChatCollapsedChange: (collapsed: boolean) => void;
  kanbanCollapsed: boolean;
  calendarCollapsed: boolean;
  /** When the shell renders the Messages strip in the left stack, hide the duplicate strip here. */
  omitCollapsedMessagesStrip?: boolean;
  /** Mobile board tab: Kanban only, no calendar rail beside the board. */
  hideCalendarSlot?: boolean;
  /** Mobile chat tab (`?tab=chat`): hide Kanban/calendar stage so Messages fills the width. */
  hideMainStageBelowMd?: boolean;
  /**
   * Desktop Messages focus: omit board/calendar column so chat is the only flex child and fills
   * horizontal space. Intended when `!chatCollapsed && kanbanCollapsed` (parent passes only then).
   */
  hideMainStage?: boolean;
  /** Chat panel; receives onCollapse for the header control (e.g. ChatArea). */
  renderChat: (helpers: { onCollapse: () => void }) => React.ReactNode;
  /** Pre-built `CalendarRail` element; merged into `KanbanBoard` as `calendarSlot` when the board is visible. */
  calendarRail: React.ReactElement;
  /**
   * The main board element rendered in the stage. Normally `<KanbanBoard>` but may be swapped for
   * a category-specific board (e.g. `<AnalyticsBoard>`). WorkspaceMainSplit injects `calendarSlot`
   * and `taskViewsNonce` via `cloneElement`, so the board must accept those as optional props.
   */
  board: React.ReactElement<{ calendarSlot?: React.ReactNode; taskViewsNonce?: number }>;
  /** Bumped after archive (etc.) so board + calendar lists refetch. */
  taskViewsNonce: number;
  /**
   * Storefront guest member preview ended: blur Kanban + calendar stage (not chat).
   * @see docs/tdd-lead-onboarding.md §7
   */
  boardSoftLocked?: boolean;
};

/**
 * Resizable split: Messages | Kanban (calendar on the right of the board, same DnD context).
 * Chat width persists per workspace in localStorage; collapse flags are controlled by the parent.
 *
 * When Kanban is collapsed and `hideMainStage` is false: Messages and Calendar **split** the row
 * (`flex-1` each). When `hideMainStage` is true (desktop Messages focus), only chat renders so it
 * spans the full main width. User opens Kanban again by collapsing Messages (shell invariant).
 */
export function WorkspaceMainSplit({
  workspaceId,
  chatCollapsed,
  onChatCollapsedChange,
  kanbanCollapsed,
  calendarCollapsed,
  omitCollapsedMessagesStrip = false,
  hideCalendarSlot = false,
  hideMainStageBelowMd = false,
  hideMainStage = false,
  renderChat,
  calendarRail,
  board,
  taskViewsNonce,
  boardSoftLocked = false,
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
      const reserve = kanbanCollapsed ? 0 : calendarSideReservePx(calendarCollapsed);
      const maxW = Math.max(MIN_CHAT_PX, total - MIN_KANBAN_PX - reserve);
      setChatWidth((w) => Math.min(w, maxW));
    };
    window.addEventListener('resize', clamp);
    clamp();
    return () => window.removeEventListener('resize', clamp);
  }, [calendarCollapsed, kanbanCollapsed]);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = chatWidth;

      const onMove = (ev: PointerEvent) => {
        const total = containerRef.current?.clientWidth ?? 0;
        const reserve = kanbanCollapsed ? 0 : calendarSideReservePx(calendarCollapsed);
        const maxW = Math.max(MIN_CHAT_PX, total - MIN_KANBAN_PX - reserve);
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
    [calendarCollapsed, chatWidth, kanbanCollapsed],
  );

  const showMessagesStrip = chatCollapsed && !omitCollapsedMessagesStrip;

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-background',
          chatCollapsed && 'pointer-events-none w-0 min-w-0 flex-[0_0_0] border-transparent',
          messagesOnlyMain && 'min-w-0 flex-1',
          hideMainStageBelowMd && 'max-md:w-full max-md:min-w-0 max-md:flex-1',
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
          className="group relative w-2 shrink-0 cursor-col-resize border-r border-border bg-muted/30 hover:bg-primary/15"
          onPointerDown={handleResizePointerDown}
        >
          <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/50" />
        </div>
      )}

      {showMessagesStrip && (
        <div
          className={cn(
            'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-black',
            COLLAPSED_COLUMN_WIDTH_CLASS,
          )}
        >
          <CollapsedColumnStrip
            title="Messages"
            expandTitle="Expand Messages"
            expandAriaLabel="Expand Messages panel"
            onExpand={expandChat}
            edge="left"
            variant="black"
          />
        </div>
      )}

      {!hideMainStage && (
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-row',
            hideMainStageBelowMd && 'max-md:hidden',
          )}
        >
          {!kanbanCollapsed ? (
            boardSoftLocked ? (
              <TrialPaywallGuard locked className="flex min-h-0 min-w-0 flex-1 flex-col">
                {isValidElement(board)
                  ? cloneElement(board, {
                      calendarSlot: hideCalendarSlot ? undefined : calendarRail,
                      taskViewsNonce,
                    })
                  : board}
              </TrialPaywallGuard>
            ) : isValidElement(board) ? (
              cloneElement(board, {
                calendarSlot: hideCalendarSlot ? undefined : calendarRail,
                taskViewsNonce,
              })
            ) : (
              board
            )
          ) : boardSoftLocked ? (
            <TrialPaywallGuard locked className="flex min-h-0 min-w-0 flex-1 flex-col">
              {isValidElement(calendarRail)
                ? cloneElement(calendarRail, { mainStage: true } as Partial<CalendarRailProps>)
                : calendarRail}
            </TrialPaywallGuard>
          ) : isValidElement(calendarRail) ? (
            cloneElement(calendarRail, { mainStage: true } as Partial<CalendarRailProps>)
          ) : (
            calendarRail
          )}
        </div>
      )}
    </div>
  );
}
