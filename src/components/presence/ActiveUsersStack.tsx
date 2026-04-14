'use client';

import { useMemo } from 'react';
import { usePresenceStore } from '@/store/presenceStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const MAX_VISIBLE = 5;

type Props = {
  /** Current auth user — used to hide the pile when only you are online. */
  localUserId: string | null | undefined;
  className?: string;
};

export function ActiveUsersStack({ localUserId, className }: Props) {
  const users = usePresenceStore((s) => s.users);

  const { visible, overflow } = useMemo(() => {
    const list = Array.from(users.values()).sort((a, b) => a.user_id.localeCompare(b.user_id));
    if (list.length === 0) return { visible: [] as typeof list, overflow: 0 };
    if (list.length === 1 && localUserId && list[0].user_id === localUserId) {
      return { visible: [], overflow: 0 };
    }
    const over = Math.max(0, list.length - MAX_VISIBLE);
    return { visible: list.slice(0, MAX_VISIBLE), overflow: over };
  }, [users, localUserId]);

  if (visible.length === 0) return null;

  return (
    <div
      className={cn('flex items-center', className)}
      role="group"
      aria-label="Active socialspace members"
    >
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <div
            key={user.user_id}
            className="rounded-full p-[2px] shadow-sm"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            <Avatar size="sm" className="ring-2 ring-background">
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
              <AvatarFallback
                className="text-[10px]"
                style={{ backgroundColor: `${user.color}33`, color: user.color }}
              >
                {(user.name || '?').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        ))}
        {overflow > 0 ? (
          <div
            className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground"
            title={`${overflow} more online`}
          >
            +{overflow}
          </div>
        ) : null}
      </div>
    </div>
  );
}
