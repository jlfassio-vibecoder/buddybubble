'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  AtSign,
  CheckSquare,
  Hash,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  X,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { lastTaskMentionSlashIndex } from '@/lib/chat-composer-tokens';

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

export type RichMessageComposerFeatures = {
  enableAtMentions?: boolean;
  enableSlashTaskLinks?: boolean;
  enableCreateAndAttachCard?: boolean;
};

export type RichMessageComposerProps = {
  value: string;
  onChange: (next: string, meta: { selectionStart: number | null }) => void;

  /** Return `true` when the parent cleared / accepted the send (composer may reset local popover UI). */
  onSubmit: (payload: { text: string; files: File[] }) => boolean | Promise<boolean>;

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

  onRequestCreateAndAttachCard?: () => void;

  density?: 'rail' | 'thread';

  popoverContainerRef?: React.RefObject<HTMLElement | null>;

  footerHint?: ReactNode;

  className?: string;
};

const defaultFeatures: Required<RichMessageComposerFeatures> = {
  enableAtMentions: true,
  enableSlashTaskLinks: true,
  enableCreateAndAttachCard: true,
};

export function RichMessageComposer({
  value,
  onChange,
  onSubmit,
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
  onRequestCreateAndAttachCard,
  density = 'rail',
  popoverContainerRef,
  footerHint,
  className,
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

  useEffect(() => {
    if (!value) {
      setShowMentions(false);
      setShowTaskMentions(false);
    }
  }, [value]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      const cursorPosition = e.target.selectionStart ?? 0;
      onChange(next, { selectionStart: cursorPosition });

      const textBeforeCursor = next.substring(0, cursorPosition);

      if (features.enableAtMentions && mentionConfig) {
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
        if (lastAtSymbol !== -1) {
          const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';
          if (charBeforeAt === ' ' || charBeforeAt === '\n') {
            const query = textBeforeCursor.substring(lastAtSymbol + 1);
            if (!query.includes(' ')) {
              setMentionSearch(query);
              setShowMentions(true);
              setMentionIndex(0);
              setShowTaskMentions(false);
              return;
            }
          }
        }
        setShowMentions(false);
      } else {
        setShowMentions(false);
      }

      if (features.enableSlashTaskLinks && slashConfig) {
        const lastSlashSymbol = lastTaskMentionSlashIndex(textBeforeCursor);
        if (lastSlashSymbol !== -1) {
          const query = textBeforeCursor.substring(lastSlashSymbol + 1);
          if (!query.includes(' ')) {
            setTaskMentionSearch(query);
            setShowTaskMentions(true);
            setTaskMentionIndex(0);
            return;
          }
        }
        setShowTaskMentions(false);
      } else {
        setShowTaskMentions(false);
      }
    },
    [
      features.enableAtMentions,
      features.enableSlashTaskLinks,
      mentionConfig,
      onChange,
      slashConfig,
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
    const ok = await onSubmit({ text: value, files: [...pendingFiles] });
    if (ok) {
      setShowMentions(false);
      setShowTaskMentions(false);
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
    }
  };

  const isRail = density === 'rail';
  const attachBtnClass = isRail
    ? 'shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30'
    : 'shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30';
  const paperclipIcon = isRail ? 'h-5 w-5' : 'h-4 w-4';
  const layoutIcon = isRail ? 'h-5 w-5' : 'h-4 w-4';
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
  const showAnyPopover = showMentionPopover || showSlashPopover;

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
