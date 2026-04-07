'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeChoice = 'light' | 'dark' | 'system';

const segmentClass =
  'h-8 min-w-0 flex-1 gap-1.5 rounded-md px-2 text-xs font-medium motion-reduce:transition-none';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = (theme ?? 'system') as ThemeChoice;

  if (!mounted) {
    return (
      <div
        className={cn('flex h-9 w-full animate-pulse rounded-lg bg-muted', className)}
        aria-hidden
      />
    );
  }

  const set = (value: ThemeChoice) => setTheme(value);

  return (
    <div
      className={cn('flex w-full rounded-lg border border-border bg-muted/50 p-0.5', className)}
      role="group"
      aria-label="Color theme"
    >
      <Button
        type="button"
        variant={active === 'light' ? 'default' : 'ghost'}
        size="sm"
        className={segmentClass}
        onClick={() => set('light')}
        title="Light"
        aria-pressed={active === 'light'}
      >
        <Sun className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Light</span>
      </Button>
      <Button
        type="button"
        variant={active === 'dark' ? 'default' : 'ghost'}
        size="sm"
        className={segmentClass}
        onClick={() => set('dark')}
        title="Dark"
        aria-pressed={active === 'dark'}
      >
        <Moon className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Dark</span>
      </Button>
      <Button
        type="button"
        variant={active === 'system' ? 'default' : 'ghost'}
        size="sm"
        className={segmentClass}
        onClick={() => set('system')}
        title="System"
        aria-pressed={active === 'system'}
      >
        <Monitor className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">System</span>
      </Button>
    </div>
  );
}
