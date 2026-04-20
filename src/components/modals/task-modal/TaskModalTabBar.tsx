'use client';

import { FileText, History, ListChecks, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskModalTab } from '@/types/open-task-options';
import { BubblyButton, type TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';

export type TaskModalTabBarProps = {
  tab: TaskModalTab;
  onSelectTab: (next: TaskModalTab) => void;
  bubblyProps: TaskBubbleUpControlProps | null;
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

function TabIconButton({
  id,
  ariaLabel,
  Icon,
  selected,
  onSelect,
}: {
  id: TaskModalTab;
  ariaLabel: string;
  Icon: (typeof TAB_CONFIG)[number]['Icon'];
  selected: boolean;
  onSelect: (next: TaskModalTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={ariaLabel}
      onClick={() => onSelect(id)}
      className={cn(
        'flex h-11 w-full min-w-0 items-center justify-center rounded-lg outline-none ring-offset-background transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={selected ? 2.25 : 2} aria-hidden />
    </button>
  );
}

export function TaskModalTabBar({ tab, onSelectTab, bubblyProps }: TaskModalTabBarProps) {
  const colCount = bubblyProps ? 5 : 4;

  return (
    <div
      className="shrink-0 border-t border-border bg-card px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
      role="tablist"
      aria-label="Card sections"
    >
      <div
        className={cn(
          'grid w-full items-stretch gap-1',
          colCount === 5 ? 'grid-cols-5' : 'grid-cols-4',
        )}
      >
        {TAB_CONFIG.map(({ id, label, Icon }) => (
          <TabIconButton
            key={id}
            id={id}
            ariaLabel={label}
            Icon={Icon}
            selected={tab === id}
            onSelect={onSelectTab}
          />
        ))}
        {bubblyProps ? (
          <div className="flex min-h-11 w-full min-w-0 items-stretch justify-center">
            <BubblyButton {...bubblyProps} density="default" tabStrip tabBarIconsRow />
          </div>
        ) : null}
      </div>
    </div>
  );
}
