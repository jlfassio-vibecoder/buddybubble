'use client';

import { Menu } from '@base-ui/react/menu';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  MoreHorizontal,
  PanelBottomOpen,
  PanelTopClose,
  Plus,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const menuItemClass =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground';

export type KanbanColumnHeaderProps = {
  label: string;
  /** Count shown in the badge (usually visible tasks in this column). */
  count: number;
  /** Tasks in this column before any board filter (used to enable sort). */
  fullTaskCount: number;
  collapsed: boolean;
  canAddTask: boolean;
  className?: string;
  onAddTask?: () => void;
  onSortByPriority?: () => void;
  onSortByTitle?: () => void;
  onToggleCollapse?: () => void;
};

export function KanbanColumnHeader({
  label,
  count,
  fullTaskCount,
  collapsed,
  canAddTask,
  className,
  onAddTask,
  onSortByPriority,
  onSortByTitle,
  onToggleCollapse,
}: KanbanColumnHeaderProps) {
  const sortDisabled = fullTaskCount < 2 || (!onSortByPriority && !onSortByTitle);

  return (
    <div className={cn('mb-2 flex items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate text-sm font-semibold capitalize text-foreground">{label}</h3>
        <span
          className="inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--accent-yellow)_35%,transparent)] bg-[var(--accent-yellow-bg)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--accent-yellow-text)]"
          aria-label={`${count} cards`}
        >
          {count}
        </span>
      </div>
      <Menu.Root modal={false}>
        <Menu.Trigger
          type="button"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
            'shrink-0 text-muted-foreground hover:text-foreground',
          )}
          aria-label={`Column actions for ${label}`}
        >
          <MoreHorizontal className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50 outline-none">
            <Menu.Popup
              className={cn(
                'min-w-[12rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md',
                'origin-[var(--transform-origin)] transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              )}
            >
              {onAddTask ? (
                <Menu.Item className={menuItemClass} disabled={!canAddTask} onClick={onAddTask}>
                  <Plus className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  Add card
                </Menu.Item>
              ) : null}
              {onSortByPriority ? (
                <Menu.Item
                  className={menuItemClass}
                  disabled={sortDisabled}
                  onClick={onSortByPriority}
                >
                  <ArrowDownWideNarrow className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  Sort by priority
                </Menu.Item>
              ) : null}
              {onSortByTitle ? (
                <Menu.Item
                  className={menuItemClass}
                  disabled={sortDisabled}
                  onClick={onSortByTitle}
                >
                  <ArrowDownAZ className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  Sort by title
                </Menu.Item>
              ) : null}
              {(onAddTask || onSortByPriority || onSortByTitle) && onToggleCollapse ? (
                <Menu.Separator className="my-1 h-px bg-border" />
              ) : null}
              {onToggleCollapse ? (
                <Menu.Item className={menuItemClass} onClick={onToggleCollapse}>
                  {collapsed ? (
                    <>
                      <PanelBottomOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
                      Expand column
                    </>
                  ) : (
                    <>
                      <PanelTopClose className="size-3.5 shrink-0 opacity-80" aria-hidden />
                      Collapse column
                    </>
                  )}
                </Menu.Item>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
