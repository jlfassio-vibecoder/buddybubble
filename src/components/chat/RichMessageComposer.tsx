'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  AtSign,
  CheckSquare,
  Dumbbell,
  Hash,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  Video,
  X,
  Zap,
} from 'lucide-react';

import { PremiumGate } from '@/components/subscription/premium-gate';
import { cn } from '@/lib/utils';
import {
  lastExerciseHashIndex,
  lastTaskMentionSlashIndex,
  resolveActiveComposerTrigger,
} from '@/lib/chat-composer-tokens';
import {
  rankExercisesForHashQuery,
  shouldSuppressHashPopoverAfterSelection,
} from '@/lib/exercise-hash-candidates';

export type RichMessageComposerMentionMember = {
  id: string;
  name: string;
  email?: string;
};

export type RichMessageComposerSlashTask = {
  id: string;
  title: string;
  status: string;
  type: 'task' | 'request' | 'idea';
};

export type RichMessageComposerMentionConfig = {
  members: RichMessageComposerMentionMember[];
  getMentionCandidates?: (query: string) => RichMessageComposerMentionMember[];
};

export type RichMessageComposerSlashConfig = {
  tasks: RichMessageComposerSlashTask[];
  getSlashCandidates?: (query: string) => RichMessageComposerSlashTask[];
};

export type RichMessageComposerExercise = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
};

export type RichMessageComposerHashConfig = {
  exercises: RichMessageComposerExercise[];
  getHashCandidates?: (query: string) => RichMessageComposerExercise[];
  /** True while the exercise catalog is loading (first request or background refresh). */
  isLoading?: boolean;
  /** Error loading the catalog; shown in the # popover (distinct from the composer `errorText` prop). */
  errorText?: string | null;
};

export type RichMessageComposerFeatures = {
  enableAtMentions?: boolean;
  enableSlashTaskLinks?: boolean;
  /** `#` to insert canonical exercise names (requires `hashConfig`). */
  enableExerciseHashMentions?: boolean;
  enableCreateAndAttachCard?: boolean;
  enableStartLiveWorkout?: boolean;
};

export type RichMessageComposerProps = {
  value: string;
  onChange: (next: string, meta: { selectionStart: number | null }) => void;

  /** Return `true` when the parent cleared / accepted the send (composer may reset local popover UI). */
  onSubmit: (payload: { text: string; files: File[] }) => boolean | Promise<boolean>;

  /**
   * When the user picks an exercise from the `#` popover, fires with the full row (id, name, slug).
   * Used by WorkoutCoachRail to attach `metadata.exercise_mentions` on send.
   */
  onExerciseHashInserted?: (exercise: RichMessageComposerExercise) => void;

  /**
   * Fires on every `<form>` submit (Enter or send button), immediately after `preventDefault`,
   * **before** the internal `canSubmit` / `isSending` guard. Use for optimistic UI when the parent
   * `onSubmit` would otherwise never run due to that guard.
   */
  onSubmitIntent?: () => void;

  pendingFiles: File[];
  onPendingFilesChange: (next: File[]) => void;
  fileAccept: string;
  onAttachmentFilesSelected?: (files: File[]) => void;

  disabled?: boolean;
  isSending?: boolean;
  canSubmit: boolean;

  attachDisabled?: boolean;
  createCardDisabled?: boolean;

  placeholder?: string;

  errorText?: string | null;

  features?: RichMessageComposerFeatures;
  mentionConfig?: RichMessageComposerMentionConfig;
  slashConfig?: RichMessageComposerSlashConfig;
  hashConfig?: RichMessageComposerHashConfig;

  onRequestCreateAndAttachCard?: () => void;
  onRequestStartLiveWorkout?: () => void;

  startLiveWorkoutDisabled?: boolean;

  density?: 'rail' | 'thread';

  popoverContainerRef?: React.RefObject<HTMLElement | null>;

  footerHint?: ReactNode;

  className?: string;

  /** Increment to focus the text input (e.g. after opening a thread from a notification). */
  focusRequestNonce?: number;
  /** Optional `data-testid` on the `<form>` for E2E harnesses (rail vs thread composers). */
  formTestId?: string;
};

const defaultFeatures: Required<RichMessageComposerFeatures> = {
  enableAtMentions: true,
  enableSlashTaskLinks: true,
  enableExerciseHashMentions: false,
  enableCreateAndAttachCard: true,
  enableStartLiveWorkout: false,
};

export function RichMessageComposer({
  value,
  onChange,
  onSubmit,
  onExerciseHashInserted,
  onSubmitIntent,
  pendingFiles,
  onPendingFilesChange,
  fileAccept,
  onAttachmentFilesSelected,
  disabled = false,
  isSending = false,
  canSubmit,
  attachDisabled,
  createCardDisabled,
  placeholder,
  errorText,
  features: featuresProp,
  mentionConfig,
  slashConfig,
  hashConfig,
  onRequestCreateAndAttachCard,
  onRequestStartLiveWorkout,
  startLiveWorkoutDisabled,
  density = 'rail',
  popoverContainerRef,
  footerHint,
  className,
  focusRequestNonce = 0,
  formTestId,
}: RichMessageComposerProps) {
  const features = { ...defaultFeatures, ...featuresProp };
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;

  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);

  const [taskMentionSearch, setTaskMentionSearch] = useState('');
  const [showTaskMentions, setShowTaskMentions] = useState(false);
  const [taskMentionIndex, setTaskMentionIndex] = useState(-1);

  const [hashSearch, setHashSearch] = useState('');
  const [showHashMentions, setShowHashMentions] = useState(false);
  const [hashMentionIndex, setHashMentionIndex] = useState(-1);

  const filteredMembers = useMemo(() => {
    if (!features.enableAtMentions || !mentionConfig) return [];
    const q = mentionSearch.toLowerCase();
    if (mentionConfig.getMentionCandidates) {
      return mentionConfig.getMentionCandidates(mentionSearch);
    }
    return mentionConfig.members.filter((m) => m.name.toLowerCase().includes(q));
  }, [features.enableAtMentions, mentionConfig, mentionSearch]);

  const filteredSlashTasks = useMemo(() => {
    if (!features.enableSlashTaskLinks || !slashConfig) return [];
    const q = taskMentionSearch.toLowerCase();
    if (slashConfig.getSlashCandidates) {
      return slashConfig.getSlashCandidates(taskMentionSearch);
    }
    return slashConfig.tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [features.enableSlashTaskLinks, slashConfig, taskMentionSearch]);

  const hashExerciseExactNames = useMemo(() => {
    if (!hashConfig?.exercises.length) return new Set<string>();
    return new Set(hashConfig.exercises.map((e) => e.name.toLowerCase()));
  }, [hashConfig?.exercises]);

  const filteredExercises = useMemo(() => {
    if (!features.enableExerciseHashMentions || !hashConfig) return [];
    if (hashConfig.getHashCandidates) {
      return hashConfig.getHashCandidates(hashSearch);
    }
    return rankExercisesForHashQuery(hashConfig.exercises, hashSearch);
  }, [features.enableExerciseHashMentions, hashConfig, hashSearch]);

  useEffect(() => {
    if (!value) {
      setShowMentions(false);
      setShowTaskMentions(false);
      setShowHashMentions(false);
    }
  }, [value]);

  useEffect(() => {
    if (!focusRequestNonce || disabled) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [focusRequestNonce, disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      const cursorPosition = e.target.selectionStart ?? 0;
      onChange(next, { selectionStart: cursorPosition });

      const textBeforeCursor = next.substring(0, cursorPosition);
      const active = resolveActiveComposerTrigger(textBeforeCursor, {
        enableAt: features.enableAtMentions && Boolean(mentionConfig),
        enableSlash: features.enableSlashTaskLinks && Boolean(slashConfig),
        enableHash: features.enableExerciseHashMentions && Boolean(hashConfig),
      });

      if (active?.kind === 'mention') {
        setMentionSearch(active.query);
        setShowMentions(true);
        setMentionIndex(0);
        setShowTaskMentions(false);
        setShowHashMentions(false);
      } else if (active?.kind === 'slash') {
        setTaskMentionSearch(active.query);
        setShowTaskMentions(true);
        setTaskMentionIndex(0);
        setShowMentions(false);
        setShowHashMentions(false);
      } else if (active?.kind === 'hash') {
        if (
          hashConfig &&
          shouldSuppressHashPopoverAfterSelection(active.rawQuery, hashExerciseExactNames)
        ) {
          setHashSearch(active.query);
          setShowHashMentions(false);
        } else {
          setHashSearch(active.query);
          setShowHashMentions(true);
          setHashMentionIndex(0);
        }
        setShowMentions(false);
        setShowTaskMentions(false);
      } else {
        setShowMentions(false);
        setShowTaskMentions(false);
        setShowHashMentions(false);
      }
    },
    [
      features.enableAtMentions,
      features.enableExerciseHashMentions,
      features.enableSlashTaskLinks,
      hashConfig,
      mentionConfig,
      onChange,
      slashConfig,
      hashExerciseExactNames,
    ],
  );

  const insertMention = useCallback(
    (userName: string) => {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = value.substring(0, cursorPosition);
      const textAfterCursor = value.substring(cursorPosition);
      const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
      const newValue =
        textBeforeCursor.substring(0, lastAtSymbol) + `@${userName} ` + textAfterCursor;
      onChange(newValue, { selectionStart: newValue.length });
      setShowMentions(false);
      inputRef.current?.focus();
    },
    [onChange, value],
  );

  const insertTaskMention = useCallback(
    (taskTitle: string) => {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = value.substring(0, cursorPosition);
      const textAfterCursor = value.substring(cursorPosition);
      const lastSlashSymbol = lastTaskMentionSlashIndex(textBeforeCursor);
      if (lastSlashSymbol < 0) return;
      const newValue =
        textBeforeCursor.substring(0, lastSlashSymbol) + `/${taskTitle} ` + textAfterCursor;
      onChange(newValue, { selectionStart: newValue.length });
      setShowTaskMentions(false);
      inputRef.current?.focus();
    },
    [onChange, value],
  );

  const insertExerciseHash = useCallback(
    (exercise: RichMessageComposerExercise) => {
      const exerciseName = exercise.name;
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = value.substring(0, cursorPosition);
      const textAfterCursor = value.substring(cursorPosition);
      const lastHash = lastExerciseHashIndex(textBeforeCursor);
      if (lastHash < 0) return;
      const textBeforeHash = textBeforeCursor.substring(0, lastHash);
      const insertedExerciseHash = `#${exerciseName} `;
      const newValue = textBeforeHash + insertedExerciseHash + textAfterCursor;
      onChange(newValue, { selectionStart: (textBeforeHash + insertedExerciseHash).length });
      onExerciseHashInserted?.(exercise);
      setShowHashMentions(false);
      inputRef.current?.focus();
    },
    [onChange, onExerciseHashInserted, value],
  );

  const handleAttachmentPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.files;
    const picked = incoming?.length ? Array.from(incoming) : [];
    e.target.value = '';
    if (picked.length === 0) return;
    onAttachmentFilesSelected?.(picked);
    onPendingFilesChange([...pendingFilesRef.current, ...picked]);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSending) return;
    onSubmitIntent?.();
    const ok = await onSubmit({ text: value, files: [...pendingFiles] });
    if (ok) {
      setShowMentions(false);
      setShowTaskMentions(false);
      setShowHashMentions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (features.enableAtMentions && showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex].name);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (features.enableSlashTaskLinks && showTaskMentions) {
      const filtered = filteredSlashTasks;
      if (filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTaskMentionIndex((prev) => (prev + 1) % filtered.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTaskMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (filtered[taskMentionIndex]) {
            insertTaskMention(filtered[taskMentionIndex].title);
          }
        }
      }
      if (e.key === 'Escape') {
        setShowTaskMentions(false);
      }
    } else if (features.enableExerciseHashMentions && showHashMentions) {
      const filtered = filteredExercises;
      if (filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHashMentionIndex((prev) => (prev + 1) % filtered.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHashMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (filtered[hashMentionIndex]) {
            insertExerciseHash(filtered[hashMentionIndex]);
          }
        }
      }
      if (e.key === 'Escape') {
        setShowHashMentions(false);
      }
    }
  };

  const isRail = density === 'rail';
  const attachBtnClass = isRail
    ? 'shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30'
    : 'shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30';
  const paperclipIcon = isRail ? 'h-5 w-5' : 'h-4 w-4';
  const layoutIcon = isRail ? 'h-5 w-5' : 'h-4 w-4';
  const videoIcon = layoutIcon;
  const inputClass = isRail
    ? 'w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-foreground transition-all placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50'
    : cn(
        'w-full rounded-xl border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground',
        'transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50',
      );
  const sendWrapClass = isRail
    ? 'absolute right-2 top-1/2 -translate-y-1/2 p-2'
    : 'absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5';
  const sendIcon = isRail ? 'h-5 w-5' : 'h-4 w-4';
  const chipOuter = isRail ? 'mb-2 flex flex-wrap gap-1.5 px-1' : 'mb-2 flex flex-wrap gap-1';
  const chipClass = isRail
    ? 'inline-flex max-w-[200px] items-center gap-1 rounded-md border border-border bg-muted/70 px-2 py-1 text-[10px] text-foreground'
    : 'inline-flex max-w-[140px] items-center gap-1 rounded border border-border bg-muted/70 px-1.5 py-0.5 text-[9px] text-foreground';
  const chipRemove = isRail ? 'h-3 w-3' : 'h-3 w-3';

  const portalHost =
    typeof document !== 'undefined' && popoverContainerRef?.current
      ? popoverContainerRef.current
      : null;

  const showMentionPopover =
    showMentions && features.enableAtMentions && filteredMembers.length > 0;
  const showSlashPopover = showTaskMentions && features.enableSlashTaskLinks;
  const showHashPopover = showHashMentions && features.enableExerciseHashMentions;
  const showAnyPopover = showMentionPopover || showSlashPopover || showHashPopover;

  const popoverLayer = showAnyPopover ? (
    <AnimatePresence>
      {showMentionPopover ? (
        <motion.div
          key="mentions"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute bottom-24 left-6 z-50 w-64 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/70 p-2">
            <AtSign className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Mention Team Member
            </span>
          </div>
          <div className="custom-scrollbar max-h-48 overflow-y-auto">
            {filteredMembers.map((member, idx) => (
              <button
                key={member.id}
                type="button"
                onClick={() => insertMention(member.name)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  idx === mentionIndex
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted/70',
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {member.name[0]}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{member.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {member.email || 'Email hidden'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}

      {showSlashPopover ? (
        <motion.div
          key="slash"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute bottom-24 left-6 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/70 p-2">
            <Hash className="h-3 w-3 text-[var(--accent-green-text)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Link card / Feature
            </span>
          </div>
          <div className="custom-scrollbar max-h-48 overflow-y-auto">
            {filteredSlashTasks.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">No cards found</p>
              </div>
            ) : (
              filteredSlashTasks.map((task, idx) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => insertTaskMention(task.title)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    idx === taskMentionIndex
                      ? 'bg-[var(--accent-green-bg)] text-[var(--accent-green-text)]'
                      : 'text-foreground hover:bg-muted/70',
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[color:color-mix(in_srgb,var(--accent-green)_22%,transparent)] text-[10px] font-bold text-[var(--accent-green-text)]">
                    {task.type === 'request' ? (
                      <Zap className="h-3 w-3" />
                    ) : task.type === 'idea' ? (
                      <Lightbulb className="h-3 w-3" />
                    ) : (
                      <CheckSquare className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{task.title}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {task.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      ) : null}

      {showHashPopover ? (
        <motion.div
          key="hash-exercise"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute bottom-24 left-6 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/70 p-2">
            <Dumbbell className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Tag exercise
            </span>
          </div>
          <div className="custom-scrollbar max-h-48 overflow-y-auto">
            {hashConfig?.errorText && hashConfig.exercises.length > 0 ? (
              <div
                className="border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[10px] text-destructive"
                role="status"
              >
                {hashConfig.errorText} — using exercises available offline.
              </div>
            ) : null}
            {hashConfig?.errorText &&
            hashConfig.exercises.length === 0 &&
            !hashConfig.getHashCandidates ? (
              <div className="p-4 text-center">
                <p className="text-xs text-destructive" role="alert">
                  {hashConfig.errorText}
                </p>
              </div>
            ) : hashConfig?.isLoading &&
              hashConfig.exercises.length === 0 &&
              !hashConfig.getHashCandidates ? (
              <div className="flex items-center justify-center gap-2 p-4 text-center">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                <p className="text-xs text-muted-foreground">Loading exercises…</p>
              </div>
            ) : filteredExercises.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">No exercises found</p>
              </div>
            ) : (
              filteredExercises.map((ex, idx) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => insertExerciseHash(ex)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    idx === hashMentionIndex
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted/70',
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-bold text-primary">
                    <Dumbbell className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{ex.name}</span>
                    {ex.slug ? (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {ex.slug}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  ) : null;

  const composerBlock = (
    <div className={cn(isRail ? 'p-6 pt-0' : '', className)}>
      <input
        ref={attachmentInputRef}
        type="file"
        className="hidden"
        multiple
        accept={fileAccept}
        onChange={handleAttachmentPick}
      />
      {errorText ? (
        <p className="mb-2 px-1 text-xs text-destructive" role="alert">
          {errorText}
        </p>
      ) : null}
      {pendingFiles.length > 0 ? (
        <div className={chipOuter}>
          {pendingFiles.map((f, i) => (
            <span key={`${f.name}-${i}`} className={chipClass}>
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onPendingFilesChange(pendingFiles.filter((_, j) => j !== i))}
                aria-label="Remove file"
              >
                <X className={chipRemove} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        data-testid={formTestId}
        onSubmit={(e) => void handleFormSubmit(e)}
        className={cn('flex items-center', isRail ? 'gap-2' : 'gap-1.5')}
      >
        <button
          type="button"
          className={attachBtnClass}
          disabled={attachDisabled ?? disabled}
          title="Attach image, video, or document"
          aria-label="Attach file"
          onClick={() => attachmentInputRef.current?.click()}
        >
          <Paperclip className={paperclipIcon} />
        </button>
        {onRequestCreateAndAttachCard ? (
          <button
            type="button"
            className={attachBtnClass}
            disabled={createCardDisabled ?? disabled}
            title="Create and attach card"
            aria-label="Create and attach card"
            onClick={onRequestCreateAndAttachCard}
          >
            <LayoutGrid className={layoutIcon} aria-hidden />
          </button>
        ) : null}
        {features.enableStartLiveWorkout && onRequestStartLiveWorkout ? (
          (startLiveWorkoutDisabled ?? disabled) ? (
            <button
              type="button"
              className={attachBtnClass}
              disabled
              title="Start live workout"
              aria-label="Start live workout"
            >
              <Video className={videoIcon} aria-hidden />
            </button>
          ) : (
            <PremiumGate feature="live_video">
              <button
                type="button"
                className={attachBtnClass}
                title="Start live workout"
                aria-label="Start live workout"
                onClick={(e) => {
                  e.preventDefault();
                  onRequestStartLiveWorkout();
                }}
              >
                <Video className={videoIcon} aria-hidden />
              </button>
            </PremiumGate>
          )
        ) : null}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!canSubmit || disabled || isSending}
            className={cn(
              sendWrapClass,
              'text-primary transition-colors hover:bg-primary/10 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent',
            )}
          >
            {isSending ? (
              <Loader2 className={cn(sendIcon, 'animate-spin')} aria-hidden />
            ) : (
              <Send className={sendIcon} aria-hidden />
            )}
          </button>
        </div>
      </form>
      {footerHint ? (
        <div className={cn('mt-2 px-1 text-[10px] text-muted-foreground', !isRail && 'px-0')}>
          {footerHint}
        </div>
      ) : null}
    </div>
  );

  const usePortalHost = Boolean(popoverContainerRef);

  return (
    <div className={cn(!usePortalHost && 'relative')}>
      {composerBlock}
      {popoverLayer && usePortalHost && portalHost ? createPortal(popoverLayer, portalHost) : null}
      {popoverLayer && !usePortalHost ? popoverLayer : null}
    </div>
  );
}
