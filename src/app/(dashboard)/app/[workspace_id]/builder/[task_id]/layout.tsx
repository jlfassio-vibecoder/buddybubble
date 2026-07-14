import type { ReactNode } from 'react';

export default function WorkoutBuilderLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      data-workout-builder-layout
    >
      {children}
    </div>
  );
}
