'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { ScrollArea } from '@/components/ui/scroll-area';

export function WorkspaceRail() {
  const pathname = usePathname();
  const userWorkspaces = useWorkspaceStore((s) => s.userWorkspaces);

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-sidebar py-3">
      <ScrollArea className="flex-1">
        <nav className="flex flex-col items-center gap-2 px-1">
          {userWorkspaces.map((w) => {
            const href = `/app/${w.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={w.id}
                href={href}
                title={w.name}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80',
                )}
              >
                {w.name.slice(0, 2).toUpperCase()}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
