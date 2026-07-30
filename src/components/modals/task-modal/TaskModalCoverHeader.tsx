'use client';

import { useState, type ReactNode } from 'react';
import { Archive, Dumbbell, Globe, Lock, MoreHorizontal, X } from 'lucide-react';
import { ITEM_TYPES_ORDER } from '@/lib/item-type-styles';
import { TaskModalTypeChip } from '@/components/modals/task-modal/TaskModalTypeChip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';
import type { ItemType, TaskVisibility } from '@/types/database';
import { cn } from '@/lib/utils';

export type TaskModalCoverHeaderProps = {
  itemType: ItemType;
  onItemTypeChange: (next: ItemType) => void;
  canManageClasses: boolean;
  canWrite: boolean;
  visibility: TaskVisibility;
  liveStreamEnabled?: boolean;
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  coverPath?: string | null;
  onClose: () => void;
  onArchiveTask?: () => void | Promise<void>;
  archiving?: boolean;
  /** Prefer More-menu entry over a third icon button (CoverHeader actions = More + Close only). */
  onOpenWorkoutViewer?: () => void;
  showOpenWorkoutViewer?: boolean;
  /** Comments / thread focus: clamp + Show more instead of editable fields. */
  descriptionCollapseMode?: 'none' | 'preview_toggle';
  readingContextActions?: ReactNode;
  heroBadge?: ReactNode;
  onInteraction?: () => void;
  className?: string;
};

/** Design `.tm-iconbtn` — 34×34, radius 9px. */
const coverIconBtnClass =
  'flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-transparent bg-foreground/[0.05] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Design `CoverHeader` (`.tm-cover`): top row (type chip · visibility · live · More/Close)
 * then borderless title + description. Optional cover image is an absolute backdrop, not a
 * separate 16:9 cinematic hero.
 */
export function TaskModalCoverHeader({
  itemType,
  onItemTypeChange,
  canManageClasses,
  canWrite,
  visibility,
  liveStreamEnabled = false,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  coverPath = null,
  onClose,
  onArchiveTask,
  archiving = false,
  onOpenWorkoutViewer,
  showOpenWorkoutViewer = false,
  descriptionCollapseMode = 'none',
  readingContextActions = null,
  heroBadge = null,
  onInteraction,
  className,
}: TaskModalCoverHeaderProps) {
  const path = coverPath?.trim() || null;
  const { url } = useTaskCardCoverUrl(path);
  const coverUrl = path && url ? url : null;
  const hasImage = Boolean(coverUrl);

  const showVisibility = itemType !== 'class';
  const isPreviewToggle = descriptionCollapseMode === 'preview_toggle';
  const editable = canWrite && !isPreviewToggle;
  const [descPreviewExpanded, setDescPreviewExpanded] = useState(false);
  const descText = description.trim();
  const titleText = title.trim() || 'Untitled';

  const showDescToggle = Boolean(readingContextActions) || (isPreviewToggle && Boolean(descText));

  return (
    <header
      className={cn(
        // `.tm-cover`
        'relative shrink-0 border-b border-border px-6 pt-[22px] pb-5',
        'bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_55%)]',
        hasImage && 'bg-background',
        className,
      )}
      onClickCapture={() => onInteraction?.()}
    >
      {hasImage ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.42]"
            style={{ backgroundImage: `url(${coverUrl})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 to-[hsl(0_0%_4%/0.85)]"
            aria-hidden
          />
        </>
      ) : null}

      <div className="relative z-[1]">
        {/* `.tm-cover-top` */}
        <div className="mb-[13px] flex items-center gap-[9px]">
          <TaskModalTypeChip
            itemType={itemType}
            onItemTypeChange={onItemTypeChange}
            disabled={!canWrite}
            typesOrder={ITEM_TYPES_ORDER}
            disabledTypes={canManageClasses ? [] : ['class']}
          />

          {showVisibility ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              {visibility === 'public' ? (
                <Globe className="size-3 shrink-0" aria-hidden />
              ) : (
                <Lock className="size-3 shrink-0" aria-hidden />
              )}
              {visibility === 'public' ? 'Public' : 'Private'}
            </span>
          ) : null}

          {liveStreamEnabled && itemType !== 'class' ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/18 px-[9px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-primary">
              <span
                className="size-[7px] shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                aria-hidden
              />
              Live huddle
            </span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {(onArchiveTask || showOpenWorkoutViewer) && (
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="More card actions" className={coverIconBtnClass}>
                  <MoreHorizontal className="size-[17px]" strokeWidth={2} aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {showOpenWorkoutViewer && onOpenWorkoutViewer ? (
                    <DropdownMenuItem onClick={onOpenWorkoutViewer}>
                      <Dumbbell className="size-4" aria-hidden />
                      Open workout viewer
                    </DropdownMenuItem>
                  ) : null}
                  {onArchiveTask ? (
                    <DropdownMenuItem
                      onClick={() => void onArchiveTask()}
                      disabled={!canWrite || archiving}
                    >
                      <Archive className="size-4" aria-hidden />
                      {archiving ? 'Archiving…' : 'Archive card'}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={coverIconBtnClass}
            >
              <X className="size-[18px]" strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>

        {heroBadge ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{heroBadge}</div>
        ) : null}

        {editable ? (
          <input
            id="task-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled card"
            aria-label="Title"
            className={cn(
              // `.tm-title-input`
              'w-full rounded-lg border-none bg-transparent px-1.5 py-0.5 -mx-1.5 text-2xl font-bold leading-[1.2] tracking-[-0.02em] text-foreground outline-none',
              'placeholder:text-muted-foreground/70',
              'hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:shadow-[inset_0_0_0_1px_var(--ring)]',
              hasImage &&
                'text-white placeholder:text-white/60 hover:bg-white/10 focus:bg-white/15',
            )}
          />
        ) : (
          <p
            className={cn(
              'text-2xl font-bold leading-[1.2] tracking-[-0.02em] text-foreground line-clamp-2',
              hasImage && 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
            )}
          >
            {titleText}
          </p>
        )}

        {editable ? (
          <textarea
            id="task-desc"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Add a description… or let the Coach fill it from chat."
            aria-label="Description"
            rows={2}
            className={cn(
              // `.tm-desc-input`
              'mt-1.5 w-full resize-none rounded-lg border-none bg-transparent px-1.5 py-1 -mx-1.5 text-[14.5px] font-normal leading-normal text-muted-foreground outline-none',
              'placeholder:text-muted-foreground/70',
              'hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:text-foreground focus:shadow-[inset_0_0_0_1px_var(--ring)]',
              hasImage &&
                'text-white/90 placeholder:text-white/50 hover:bg-white/10 focus:bg-white/15 focus:text-white',
            )}
          />
        ) : descText ? (
          <div className="mt-1.5">
            <p
              className={cn(
                'text-[14.5px] leading-normal text-muted-foreground',
                isPreviewToggle
                  ? descPreviewExpanded
                    ? 'whitespace-pre-wrap'
                    : 'line-clamp-3'
                  : 'line-clamp-4',
                hasImage && 'text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]',
              )}
            >
              {descText}
            </p>
          </div>
        ) : null}

        {showDescToggle ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            {isPreviewToggle && descText ? (
              <button
                type="button"
                className={cn(
                  'text-xs font-medium underline-offset-2 hover:underline',
                  hasImage ? 'text-white/95' : 'text-primary',
                )}
                aria-expanded={descPreviewExpanded}
                onClick={() => setDescPreviewExpanded((v) => !v)}
              >
                {descPreviewExpanded ? 'Show less' : 'Show more'}
              </button>
            ) : (
              <span className="min-w-0 flex-1" aria-hidden />
            )}
            {readingContextActions ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {readingContextActions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
