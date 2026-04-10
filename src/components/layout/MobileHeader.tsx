'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  /** Right-aligned slot (e.g. presence face pile). */
  trailing?: ReactNode;
};

/** Title bar only; navigation opens from the bottom tab bar “Menu” item. */
export function MobileHeader({ title, trailing }: Props) {
  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-border bg-background px-4 md:hidden">
      <h1
        className={cn(
          'min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground',
          trailing ? 'pr-14' : '',
        )}
      >
        {title}
      </h1>
      {trailing ? (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
          {trailing}
        </div>
      ) : null}
    </header>
  );
}
