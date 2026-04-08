'use client';

import * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { GripHorizontal, GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ResizablePanelGroupProps = Omit<React.ComponentProps<typeof Group>, 'orientation'> & {
  direction?: 'horizontal' | 'vertical';
  /** Sets Group `id` for layout persistence hooks (`useDefaultLayout` must use the same id). */
  autoSaveId?: string;
};

function ResizablePanelGroup({
  className,
  direction = 'horizontal',
  autoSaveId,
  id,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      id={autoSaveId ?? id}
      orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
      className={cn('h-full min-h-0 w-full', className)}
      {...props}
    />
  );
}

function ResizablePanel({ className, ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel className={cn('min-h-0', className)} {...props} />;
}

type ResizableHandleProps = React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
  /** Same as `ResizablePanelGroup` `direction` (vertical stack → horizontal drag bar). */
  direction?: 'horizontal' | 'vertical';
};

function ResizableHandle({
  withHandle,
  className,
  direction = 'horizontal',
  ...props
}: ResizableHandleProps) {
  const verticalGroup = direction === 'vertical';
  return (
    <Separator
      className={cn(
        'relative z-10 flex shrink-0 items-center justify-center bg-border transition-colors hover:bg-muted',
        verticalGroup ? 'h-2.5 w-full cursor-row-resize' : 'h-full w-2.5 cursor-col-resize',
        className,
      )}
      {...props}
    >
      {withHandle ? (
        verticalGroup ? (
          <span className="rounded-sm border border-border bg-muted/80 px-1 shadow-sm">
            <GripHorizontal className="size-3 text-muted-foreground" strokeWidth={2} aria-hidden />
          </span>
        ) : (
          <span className="rounded-sm border border-border bg-muted/80 py-1 shadow-sm">
            <GripVertical className="size-3 text-muted-foreground" strokeWidth={2} aria-hidden />
          </span>
        )
      ) : null}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
