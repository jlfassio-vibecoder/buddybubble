'use client';

import { FileText, History, ListChecks, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskModalTab } from '@/types/open-task-options';
import { BubblyButton, type TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { Badge } from '@/components/ui/badge';

export type TaskModalTabCounts = Partial<Record<TaskModalTab, number>>;

export type TaskModalTabBarProps = {
  tab: TaskModalTab;
  onSelectTab: (next: TaskModalTab) => void;
  bubblyProps: TaskBubbleUpControlProps | null;
  /** Optional count badges (subtasks remaining, activity entries, …) shown on desktop labels. */
  counts?: TaskModalTabCounts;
};

const TAB_CONFIG: {
  id: TaskModalTab;
  label: string;
  Icon: typeof FileText;
}[] = [
  { id: 'details', label: 'Details', Icon: FileText },
  { id: 'comments', label: 'Comments', Icon: MessageCircle },
  { id: 'subtasks', label: 'Subtasks', Icon: ListChecks },
  { id: 'activity', label: 'Activity', Icon: History },
];

function TabButton({
  id,
  label,
  Icon,
  selected,
  count,
  onSelect,
}: {
  id: TaskModalTab;
  label: string;
  Icon: (typeof TAB_CONFIG)[number]['Icon'];
  selected: boolean;
  count?: number;
  onSelect: (next: TaskModalTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={label}
      onClick={() => onSelect(id)}
      className={cn(
        'flex h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 outline-none ring-offset-background transition-colors',
        'md:relative md:h-auto md:w-auto md:rounded-none md:px-3 md:py-2.5',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'bg-primary/15 text-primary md:bg-transparent'
          : 'text-muted-foreground hover:bg-muted md:hover:bg-transparent md:hover:text-foreground',
      )}
    >
      <Icon className="size-5 shrink-0 md:size-4" strokeWidth={selected ? 2.25 : 2} aria-hidden />
      <span className="hidden text-sm font-semibold md:inline">{label}</span>
      {count != null && count > 0 ? (
        <Badge variant={selected ? 'primary' : 'default'} className="hidden md:inline-flex">
          {count}
        </Badge>
      ) : null}
      {selected ? (
        <span
          className="absolute inset-x-2.5 -bottom-px hidden h-0.5 rounded-full bg-primary md:block"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export function TaskModalTabBar({ tab, onSelectTab, bubblyProps, counts }: TaskModalTabBarProps) {
  const colCount = bubblyProps ? 5 : 4;

  return (
    <div
      className="shrink-0 border-t border-border bg-card px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] md:px-2 md:py-0"
      role="tablist"
      aria-label="Card sections"
    >
      <div
        className={cn(
          'grid w-full items-stretch gap-1',
          'md:flex md:items-stretch md:gap-0.5',
          colCount === 5 ? 'grid-cols-5' : 'grid-cols-4',
        )}
      >
        {TAB_CONFIG.map(({ id, label, Icon }) => (
          <TabButton
            key={id}
            id={id}
            label={label}
            Icon={Icon}
            selected={tab === id}
            count={counts?.[id]}
            onSelect={onSelectTab}
          />
        ))}
        {bubblyProps ? (
          <div className="flex min-h-11 w-full min-w-0 items-stretch justify-center md:min-h-0 md:w-auto md:shrink-0 md:items-center md:px-1">
            <BubblyButton {...bubblyProps} density="default" tabStrip tabBarIconsRow />
          </div>
        ) : null}
      </div>
    </div>
  );
}
