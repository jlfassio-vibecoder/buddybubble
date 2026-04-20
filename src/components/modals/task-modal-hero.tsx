'use client';

/**
 * Layout routing (mobile “ghost CSS” debugging):
 * - `useCinematicLayout` is true only when `!compactCinematic` and (signed cover URL **or** `cinematicPlaceholder`).
 * - Without a resolved image and without `cinematicPlaceholder`, the **compact** branch renders (card-style header).
 * - Inverted mobile description utilities (`bg-transparent md:bg-muted/20`, `-mx-4`, …) apply only to **scrollable**
 *   description blocks in the **compact** branch (expanded preview / legacy expanded), not to cinematic overlay text
 *   or collapsed line-clamp-only descriptions.
 */
import { useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';
import { cn } from '@/lib/utils';

export type TaskModalHeroProps = {
  title: string;
  description: string;
  /** Supabase Storage path in `task-attachments`, or empty when no cover. */
  coverPath: string | null;
  className?: string;
  /** Pinned top-right on the hero so the modal stays closable while the body scrolls. */
  onClose?: () => void;
  /** Unified comments thread: exit thread (top-left control, mirrors close on the right). */
  onBack?: () => void;
  /**
   * When a cover image is loaded, the hero defaults to a tall 16:9 frame. Set true (e.g. after
   * the user uses type/visibility chrome) to use the compact header so more of the modal is
   * visible below.
   */
  compactCinematic?: boolean;
  /** When `descriptionCollapseMode` is `none`: show full description (scrollable) instead of line-clamp. */
  descriptionExpanded?: boolean;
  /**
   * Comments / thread focus: default to a short preview with Show more / less instead of a tall
   * always-expanded block. When set, `descriptionExpanded` is ignored for description layout.
   */
  descriptionCollapseMode?: 'none' | 'preview_toggle';
  /** Shown on the same row as the description toggle (e.g. compact Generate workout). */
  readingContextActions?: ReactNode;
  /**
   * Use the 16:9 cinematic frame even when there is no signed cover image (gradient placeholder).
   * Intended for workout / workout_log cards so layout does not fall back to the compact card header.
   */
  cinematicPlaceholder?: boolean;
};

const closeButtonBase =
  'shrink-0 rounded-lg border p-2 shadow-sm transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const expandedPreviewMaxClass = 'max-h-[min(30dvh,16rem)]';

/**
 * Read-only preview hero for persisted tasks: when a cover image is available, a full 16:9
 * frame with `object-contain` and title + description overlay. Without an image (or while
 * loading / if signing fails), defaults to a compact header unless `cinematicPlaceholder`
 * forces the same frame with a gradient background. Editable fields live in Details below.
 */
export function TaskModalHero({
  title,
  description,
  coverPath,
  className,
  onClose,
  onBack,
  compactCinematic = false,
  descriptionExpanded = false,
  descriptionCollapseMode = 'none',
  readingContextActions = null,
  cinematicPlaceholder = false,
}: TaskModalHeroProps) {
  const path = coverPath?.trim() || null;
  const { url, loading } = useTaskCardCoverUrl(path);
  const hasPath = Boolean(path);
  const coverUrl = path && url ? url : null;
  const showImage = Boolean(coverUrl);
  const useCinematicLayout = !compactCinematic && (showImage || cinematicPlaceholder);
  /** Fixed 16:9 frame only when a real cover drives layout; placeholder hugs content on desktop. */
  const imageBackedCinematic = useCinematicLayout && showImage;
  const coverLoading = hasPath && loading && !url;
  const titleText = title.trim() || 'Untitled';
  const descText = description.trim();

  const isPreviewToggle = descriptionCollapseMode === 'preview_toggle';
  const [descPreviewExpanded, setDescPreviewExpanded] = useState(false);

  const legacyExpanded = !isPreviewToggle && descriptionExpanded;
  const showDescToggleRow =
    Boolean(readingContextActions) || (isPreviewToggle && Boolean(descText));

  const titleClampClass = isPreviewToggle
    ? 'line-clamp-2'
    : legacyExpanded
      ? 'line-clamp-3'
      : 'line-clamp-2';

  /** Expanded scrollable description uses horizontal bleed on mobile; align the toggle row with inner text padding. */
  const cinematicDescScrollBleeds =
    Boolean(descText) && (isPreviewToggle ? descPreviewExpanded : legacyExpanded);
  const compactDescScrollBleeds =
    Boolean(descText) && (isPreviewToggle ? descPreviewExpanded : legacyExpanded);

  const renderDescToggleRow = (
    variant: 'cinematic' | 'compact',
    opts?: { cinematicMdPad?: boolean; compactMdPad?: boolean },
  ) => {
    if (!showDescToggleRow) return null;
    const btnBase =
      variant === 'cinematic'
        ? 'text-xs font-medium text-white/95 underline-offset-2 hover:underline [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]'
        : 'text-xs font-medium text-primary underline-offset-2 hover:underline';

    return (
      <div
        className={cn(
          'mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2',
          variant === 'cinematic' && 'pointer-events-auto',
          opts?.cinematicMdPad && 'px-4 md:px-2',
          opts?.compactMdPad && 'px-4 md:px-2',
        )}
      >
        {isPreviewToggle && descText ? (
          <button
            type="button"
            className={btnBase}
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
    );
  };

  return (
    <div
      className={cn(
        'shrink-0 border-b border-border',
        useCinematicLayout
          ? 'max-md:px-0 max-md:pb-0 max-md:pt-0 md:px-6 md:pb-4 md:pt-3'
          : 'px-6 pb-4 pt-3',
        className,
      )}
    >
      <div
        className={cn(
          'relative isolate rounded-xl border border-border/60',
          /* Cinematic: mobile bleeds to modal edges (see TaskModal mobile shell); compact needs visible overflow so -mx-4 description bleed is not clipped. */
          useCinematicLayout && 'max-md:rounded-none max-md:border-x-0 max-md:border-t-0',
          useCinematicLayout
            ? cn(
                'w-full bg-muted overflow-hidden',
                imageBackedCinematic
                  ? 'aspect-video'
                  : 'max-md:aspect-video md:aspect-auto md:min-h-0 md:h-auto',
              )
            : 'w-full bg-card overflow-visible',
        )}
      >
        {useCinematicLayout ? (
          <>
            {onBack ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'absolute left-3 top-3 z-20',
                  'border-white/25 bg-black/45 text-white hover:bg-black/60',
                )}
                aria-label="Back to comments"
                onClick={onBack}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'absolute right-3 top-3 z-20',
                  'border-white/25 bg-black/45 text-white hover:bg-black/60',
                )}
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}

            {showImage ? (
              <img
                src={coverUrl ?? undefined}
                alt=""
                className="absolute inset-0 h-full w-full object-contain object-center"
              />
            ) : (
              <div
                className="absolute inset-0 bg-gradient-to-br from-muted via-muted/90 to-primary/10"
                aria-hidden
              />
            )}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/50"
              aria-hidden
            />

            <div
              className={cn(
                'pointer-events-none relative z-10 flex min-h-0 flex-col justify-start p-4 text-white',
                imageBackedCinematic
                  ? 'h-full overflow-hidden'
                  : 'max-md:h-full max-md:overflow-hidden md:h-auto md:overflow-visible',
                onBack && 'pl-12',
              )}
            >
              <p
                className={cn(
                  'pointer-events-auto font-semibold leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
                  titleClampClass,
                )}
              >
                {titleText}
              </p>
              {descText ? (
                <div
                  className={cn(
                    'pointer-events-auto mt-1 min-h-0',
                    isPreviewToggle
                      ? descPreviewExpanded
                        ? cn(
                            expandedPreviewMaxClass,
                            'overflow-y-auto custom-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:pr-1',
                          )
                        : ''
                      : legacyExpanded
                        ? 'max-h-[min(42dvh,22rem)] flex-1 overflow-y-auto custom-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:pr-1'
                        : imageBackedCinematic
                          ? 'flex-1'
                          : 'flex-none',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm leading-relaxed [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]',
                      isPreviewToggle
                        ? descPreviewExpanded
                          ? 'whitespace-pre-wrap text-white/90'
                          : 'line-clamp-3 text-white/90'
                        : legacyExpanded
                          ? 'whitespace-pre-wrap text-white/90'
                          : 'line-clamp-4 text-white/90',
                    )}
                  >
                    {descText}
                  </p>
                </div>
              ) : null}
              {renderDescToggleRow('cinematic', {
                cinematicMdPad: cinematicDescScrollBleeds,
              })}
            </div>
          </>
        ) : (
          <div className={cn('relative p-4', onBack && 'pl-12', onClose && 'pr-12')}>
            {onBack ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'absolute left-3 top-3 z-20',
                  'border-border/60 bg-card/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground',
                )}
                aria-label="Back to comments"
                onClick={onBack}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'absolute right-3 top-3 z-20',
                  'border-border/60 bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0 w-full">
              <p className={cn('font-semibold leading-snug text-foreground', titleClampClass)}>
                {titleText}
              </p>
              {coverLoading ? (
                <div
                  className="mt-2 h-1.5 max-w-[7rem] animate-pulse rounded-full bg-muted"
                  aria-hidden
                />
              ) : null}
              {descText ? (
                isPreviewToggle ? (
                  descPreviewExpanded ? (
                    <div
                      className={cn(
                        'mt-1 overflow-y-auto custom-scrollbar',
                        expandedPreviewMaxClass,
                        '-mx-4 px-4 md:mx-0',
                        'bg-transparent md:bg-muted/20',
                        'border-0 md:border md:border-border',
                        'rounded-none md:rounded-md',
                        'py-1 md:py-2',
                        'md:px-2',
                      )}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        {descText}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {descText}
                    </p>
                  )
                ) : legacyExpanded ? (
                  <div
                    className={cn(
                      'mt-1 max-h-[min(48dvh,28rem)] overflow-y-auto custom-scrollbar',
                      '-mx-4 px-4 md:mx-0',
                      'bg-transparent md:bg-muted/20',
                      'border-0 md:border md:border-border',
                      'rounded-none md:rounded-md',
                      'py-1 md:py-2',
                      'md:px-2',
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {descText}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                    {descText}
                  </p>
                )
              ) : null}
              {renderDescToggleRow('compact', {
                compactMdPad: compactDescScrollBleeds,
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
