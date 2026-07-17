'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Globe, Lock, MoreHorizontal, Play, Users } from 'lucide-react';
import { toast } from 'sonner';

import { unpublishFromVideoLibraryAction } from '@/app/(dashboard)/app/[workspace_id]/video-library-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  accessScopeBadge,
  publicationDisplayTitle,
  type VideoLibraryListItem,
} from '@/lib/video-library/library';
import { cn } from '@/lib/utils';

export type VideoPublicationCardProps = {
  item: VideoLibraryListItem;
  canManage: boolean;
  workspaceId: string;
  onUnpublished: (publicationId: string) => void;
};

function formatPublishedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function VideoPublicationCard({
  item,
  canManage,
  workspaceId,
  onUnpublished,
}: VideoPublicationCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [unpublishing, setUnpublishing] = useState(false);

  const badge = accessScopeBadge(item.access_scope);
  const BadgeIcon = badge.icon === 'globe' ? Globe : badge.icon === 'lock' ? Lock : Users;
  const title = publicationDisplayTitle(item);

  const openPlayer = () => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('class_async_player', item.class_instance_id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const openDeckBuilder = () => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('class_deck_builder', item.class_instance_id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const handleUnpublish = async () => {
    if (
      !window.confirm(`Unpublish “${title}”? Members will no longer see it in the Video Library.`)
    ) {
      return;
    }
    setUnpublishing(true);
    const res = await unpublishFromVideoLibraryAction({
      workspaceId,
      publicationId: item.id,
    });
    setUnpublishing(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success('Unpublished');
    onUnpublished(item.id);
  };

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm',
        'min-w-0',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatPublishedAt(item.published_at)}
          </p>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              disabled={unpublishing}
              aria-label="Publication actions"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'shrink-0 text-muted-foreground hover:text-foreground',
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={unpublishing} onClick={openDeckBuilder}>
                Edit workout
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={unpublishing}
                onClick={() => void handleUnpublish()}
              >
                Unpublish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BadgeIcon className="size-3.5 shrink-0" aria-hidden />
        <span>{badge.label}</span>
      </div>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-auto h-8 w-full gap-2 text-xs"
        onClick={openPlayer}
      >
        <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Play
      </Button>
    </article>
  );
}
