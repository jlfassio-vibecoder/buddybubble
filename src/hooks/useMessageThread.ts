'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import {
  buildReplyCounts,
  fetchEmbeddedTaskForMessage,
  MESSAGES_SELECT_WITH_TASK,
  messageThreadChannelName,
  messageThreadFilterKey,
  toChatUserSnapshot,
  type MessageThreadFilter,
} from '@/lib/message-thread';
import { defaultBubbleIdForWrites } from '@/lib/all-bubbles';
import type { BubbleRow, MessageRow, MessageRowWithEmbeddedTask, TaskRow } from '@/types/database';
import type { ChatUserSnapshot } from '@/types/chat';
import {
  attachmentsToJson,
  classifyFileKind,
  inferMimeFromFileName,
  type MessageAttachment,
} from '@/types/message-attachment';
import {
  buildMessageAttachmentObjectPath,
  MESSAGE_ATTACHMENTS_BUCKET,
  removeMessageAttachmentPrefix,
} from '@/lib/message-storage';
import { validateAttachmentFiles } from '@/lib/message-attachment-limits';
import { captureVideoPoster, getVideoFileMetadata } from '@/lib/video-poster';
import { renderPdfFirstPageToJpegBlob } from '@/lib/pdf-page-thumbnail';
import { formatUserFacingError } from '@/lib/format-error';

export type { MessageThreadFilter } from '@/lib/message-thread';

export type MessageThreadTeamMember = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

export type UseMessageThreadArgs = {
  filter: MessageThreadFilter | null;
  workspaceId: string | null;
  bubbles: BubbleRow[];
  canPostMessages: boolean;
};

export type UseMessageThreadResult = {
  messages: MessageRowWithEmbeddedTask[];
  userById: Record<string, ChatUserSnapshot>;
  teamMembers: MessageThreadTeamMember[];
  replyCounts: Map<string, number>;
  isLoading: boolean;
  error: string | null;
  sending: boolean;
  sendMessage: (
    content: string,
    parentId?: string,
    files?: File[],
    options?: { attachedTaskId?: string | null },
  ) => Promise<boolean>;
  clearError: () => void;
  setError: (message: string | null) => void;
};

export function useMessageThread({
  filter,
  workspaceId,
  bubbles,
  canPostMessages,
}: UseMessageThreadArgs): UseMessageThreadResult {
  const [messages, setMessages] = useState<MessageRowWithEmbeddedTask[]>([]);
  const [userById, setUserById] = useState<Record<string, ChatUserSnapshot>>({});
  const [teamMembers, setTeamMembers] = useState<MessageThreadTeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [taskBubbleId, setTaskBubbleId] = useState<string | null>(null);

  const filterKey = messageThreadFilterKey(filter);

  useEffect(() => {
    if (!filter || filter.scope !== 'task') {
      setTaskBubbleId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tasks')
        .select('bubble_id')
        .eq('id', filter.taskId)
        .maybeSingle();
      if (cancelled) return;
      setTaskBubbleId((data as { bubble_id?: string } | null)?.bubble_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter && filter.scope === 'task' ? filter.taskId : null]);

  useEffect(() => {
    if (!filter) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    const f = filter;
    if (f.scope === 'all_bubbles' && f.bubbleIds.length === 0) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    async function load() {
      const supabase = createClient();
      let q = supabase
        .from('messages')
        .select(MESSAGES_SELECT_WITH_TASK)
        .order('created_at', { ascending: true });
      if (f.scope === 'all_bubbles') {
        q = q.in('bubble_id', [...f.bubbleIds]);
      } else if (f.scope === 'bubble') {
        q = q.eq('bubble_id', f.bubbleId);
      } else {
        q = q.eq('target_task_id', f.taskId);
      }
      const { data, error: qErr } = await q;
      if (cancelled) return;
      if (qErr) {
        console.error('[useMessageThread] load messages', supabaseClientErrorMessage(qErr));
        setMessages([]);
        setIsLoading(false);
        return;
      }
      const rows = (data ?? []) as MessageRowWithEmbeddedTask[];
      setMessages(rows);
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length === 0) {
        setIsLoading(false);
        return;
      }
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, email, created_at')
        .in('id', ids);
      if (cancelled) return;
      setUserById((prev) => {
        const next = { ...prev };
        for (const u of users ?? []) {
          next[u.id] = toChatUserSnapshot(u);
        }
        return next;
      });
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [filterKey]);

  useEffect(() => {
    if (!filter) return;
    const f = filter;

    const supabase = createClient();
    const channelName = messageThreadChannelName(f);
    const channel = supabase.channel(channelName);

    const onInsert = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      void (async () => {
        const supa = createClient();
        const enriched = await fetchEmbeddedTaskForMessage(supa, row);
        setMessages((prev) => {
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return [...prev, enriched].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });
        const { data: u } = await supa
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', row.user_id)
          .maybeSingle();
        if (u) {
          setUserById((prev) => ({ ...prev, [u.id]: toChatUserSnapshot(u) }));
        }
      })();
    };
    const onUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      void (async () => {
        const supa = createClient();
        const enriched = await fetchEmbeddedTaskForMessage(supa, row);
        setMessages((prev) => prev.map((m) => (m.id === row.id ? enriched : m)));
      })();
    };
    const onDelete = (payload: { old: Record<string, unknown> }) => {
      const old = payload.old as { id?: string };
      if (!old?.id) return;
      setMessages((prev) => prev.filter((m) => m.id !== old.id));
    };

    const onTaskInsertOrUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as TaskRow;
      if (!row?.id) return;
      setMessages((prev) => {
        if (!prev.some((m) => m.attached_task_id === row.id)) return prev;
        return prev.map((m) => {
          if (m.attached_task_id !== row.id) return m;
          if (row.archived_at) return { ...m, tasks: null };
          return { ...m, tasks: row };
        });
      });
    };

    const onTaskDelete = (payload: { old: Record<string, unknown> }) => {
      const oldId = (payload.old as { id?: string })?.id;
      if (!oldId) return;
      setMessages((prev) => {
        if (!prev.some((m) => m.attached_task_id === oldId)) return prev;
        return prev.map((m) => (m.attached_task_id === oldId ? { ...m, tasks: null } : m));
      });
    };

    if (f.scope === 'all_bubbles') {
      for (const bid of f.bubbleIds) {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onInsert,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onDelete,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskInsertOrUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskInsertOrUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskDelete,
        );
      }
    } else if (f.scope === 'bubble') {
      const bubbleId = f.bubbleId;
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onInsert,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onDelete,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskDelete,
      );
    } else {
      const taskId = f.taskId;
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onInsert,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onDelete,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskDelete,
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [filterKey, filter]);

  useEffect(() => {
    if (!workspaceId) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    async function loadMembers() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const myId = authUser?.id ?? null;
      const { data } = await supabase
        .from('workspace_members')
        .select(
          'user_id, show_email_to_workspace_members, users ( id, full_name, avatar_url, email, created_at )',
        )
        .eq('workspace_id', workspaceId);
      if (cancelled) return;
      const members: MessageThreadTeamMember[] = [];
      const fromRows: Record<string, ChatUserSnapshot> = {};
      for (const row of data ?? []) {
        const u = (row as { users?: ChatUserSnapshot | ChatUserSnapshot[] | null }).users;
        const usr = Array.isArray(u) ? u[0] : u;
        if (!usr?.id) continue;
        const showPeerEmail =
          myId != null &&
          (usr.id === myId ||
            (row as { show_email_to_workspace_members?: boolean })
              .show_email_to_workspace_members === true);
        const displayEmail = showPeerEmail ? (usr.email ?? '') : '';
        const displayName =
          usr.full_name?.trim() ||
          (showPeerEmail ? usr.email?.split('@')[0] : undefined)?.trim() ||
          'Member';
        members.push({
          id: usr.id,
          name: displayName,
          email: displayEmail,
          avatar: usr.avatar_url ?? undefined,
        });
        fromRows[usr.id] = toChatUserSnapshot({
          ...usr,
          email: showPeerEmail ? usr.email : null,
        });
      }
      setTeamMembers(members);
      setUserById((prev) => ({ ...prev, ...fromRows }));
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const replyCounts = useMemo(() => buildReplyCounts(messages), [messages]);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (
      content: string,
      parentId?: string,
      files?: File[],
      options?: { attachedTaskId?: string | null },
    ): Promise<boolean> => {
      if (!canPostMessages) {
        setError('You do not have permission to post messages in this channel.');
        return false;
      }
      if (!workspaceId) {
        setError('No socialspace selected.');
        return false;
      }
      if (!filter) {
        setError('Select a bubble to post.');
        return false;
      }
      const raw = files ?? [];
      const attachedTaskId = options?.attachedTaskId ?? null;
      const hasAttachedTask = Boolean(attachedTaskId);

      if (!content.trim() && raw.length === 0 && !hasAttachedTask) return false;

      if (hasAttachedTask && raw.length > 0) {
        setError('Remove pending attachments before posting a card, or send files separately.');
        return false;
      }

      if (!hasAttachedTask) {
        if (!content.trim()) {
          setError('Message text is required.');
          return false;
        }
      }
      const candidates = raw.filter((f) => classifyFileKind(f) !== 'unsupported');
      const validated = validateAttachmentFiles(candidates);
      if (!validated.ok) {
        setError(validated.message);
        return false;
      }
      const accepted = validated.files;
      setError(null);

      let targetBubbleId: string | null = null;
      if (parentId) {
        const parentRow = messages.find((m) => m.id === parentId);
        targetBubbleId = parentRow?.bubble_id ?? null;
      } else if (filter.scope === 'all_bubbles') {
        targetBubbleId = defaultBubbleIdForWrites(bubbles);
      } else if (filter.scope === 'bubble') {
        targetBubbleId = filter.bubbleId;
      } else {
        targetBubbleId = taskBubbleId;
      }
      if (!targetBubbleId) {
        setError(
          parentId
            ? 'Could not find thread parent. Try closing and reopening the thread.'
            : filter.scope === 'task'
              ? 'Could not resolve task bubble.'
              : 'Add a bubble in this socialspace before posting attachments.',
        );
        return false;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('You need to be signed in to send messages.');
        return false;
      }

      if (attachedTaskId) {
        const { data: attachTask, error: attachErr } = await supabase
          .from('tasks')
          .select('bubble_id')
          .eq('id', attachedTaskId)
          .single();
        if (attachErr || !attachTask) {
          setError('Could not verify the card for this message.');
          return false;
        }
        if (attachTask.bubble_id !== targetBubbleId) {
          setError('That card belongs to a different bubble than this message.');
          return false;
        }
      }

      const targetTaskId = filter.scope === 'task' ? filter.taskId : null;

      setSending(true);
      try {
        const { data: inserted, error: insErr } = await supabase
          .from('messages')
          .insert({
            bubble_id: targetBubbleId,
            user_id: user.id,
            content: content.trim(),
            parent_id: parentId ?? null,
            attached_task_id: attachedTaskId,
            target_task_id: targetTaskId,
          })
          .select(MESSAGES_SELECT_WITH_TASK)
          .single();

        if (insErr || !inserted?.id) {
          console.error(
            '[useMessageThread] message insert',
            insErr ? supabaseClientErrorMessage(insErr) : 'insert returned no row',
          );
          setError(
            insErr ? formatUserFacingError(insErr) : 'Could not create message. Please try again.',
          );
          return false;
        }

        const messageId = inserted.id;
        const row = inserted as MessageRowWithEmbeddedTask;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });

        const abortAttempt = async () => {
          await removeMessageAttachmentPrefix(supabase, workspaceId, messageId);
          await supabase.from('messages').delete().eq('id', messageId);
        };

        const meta: MessageAttachment[] = [];

        for (const file of accepted) {
          const k = classifyFileKind(file);
          if (k === 'image' || k === 'document') {
            const path = buildMessageAttachmentObjectPath(workspaceId, messageId, file.name);
            const { error: upErr } = await supabase.storage
              .from(MESSAGE_ATTACHMENTS_BUCKET)
              .upload(path, file, { cacheControl: '3600', upsert: false });
            if (upErr) {
              console.error(
                '[useMessageThread] attachment upload',
                supabaseClientErrorMessage(upErr),
              );
              setError(formatUserFacingError(upErr));
              await abortAttempt();
              return false;
            }
            const mime =
              file.type || inferMimeFromFileName(file.name) || 'application/octet-stream';
            const isPdf = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            let pdfThumbPath: string | null = null;
            let pdfW: number | null = null;
            let pdfH: number | null = null;
            if (k === 'document' && isPdf) {
              try {
                const pdfThumb = await renderPdfFirstPageToJpegBlob(file);
                const thumbStorePath = buildMessageAttachmentObjectPath(
                  workspaceId,
                  messageId,
                  'pdf-thumb.jpg',
                );
                const { error: upPdfThumb } = await supabase.storage
                  .from(MESSAGE_ATTACHMENTS_BUCKET)
                  .upload(thumbStorePath, pdfThumb.blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg',
                  });
                if (!upPdfThumb) {
                  pdfThumbPath = thumbStorePath;
                  pdfW = pdfThumb.width;
                  pdfH = pdfThumb.height;
                } else {
                  console.error(
                    '[useMessageThread] pdf thumb upload',
                    supabaseClientErrorMessage(upPdfThumb),
                  );
                }
              } catch (e) {
                console.error('[useMessageThread] pdf thumb', supabaseClientErrorMessage(e));
              }
            }
            const docImage: MessageAttachment = {
              id: crypto.randomUUID(),
              kind: k,
              path,
              file_name: file.name,
              mime_type: mime,
              size_bytes: file.size,
              uploaded_at: new Date().toISOString(),
            };
            if (pdfThumbPath) {
              docImage.thumb_path = pdfThumbPath;
              docImage.width = pdfW;
              docImage.height = pdfH;
            }
            meta.push(docImage);
          } else if (k === 'video') {
            const path = buildMessageAttachmentObjectPath(workspaceId, messageId, file.name);
            const thumbPath = buildMessageAttachmentObjectPath(
              workspaceId,
              messageId,
              'poster.jpg',
            );
            const { error: upVid } = await supabase.storage
              .from(MESSAGE_ATTACHMENTS_BUCKET)
              .upload(path, file, { cacheControl: '3600', upsert: false });
            if (upVid) {
              console.error('[useMessageThread] video upload', supabaseClientErrorMessage(upVid));
              setError(formatUserFacingError(upVid));
              await abortAttempt();
              return false;
            }

            let vm: Awaited<ReturnType<typeof getVideoFileMetadata>>;
            try {
              vm = await getVideoFileMetadata(file);
            } catch (e) {
              console.error('[useMessageThread] video metadata', supabaseClientErrorMessage(e));
              setError(e instanceof Error ? e.message : 'Could not read video.');
              await abortAttempt();
              return false;
            }

            const useEdgePoster = process.env.NEXT_PUBLIC_MESSAGE_VIDEO_POSTER_EDGE === '1';
            let thumb_path = thumbPath;
            let width = vm.width;
            let height = vm.height;
            let duration_sec = vm.duration_sec;

            if (useEdgePoster) {
              const { data, error: fnErr } = await supabase.functions.invoke(
                'generate-message-video-poster',
                {
                  body: {
                    workspace_id: workspaceId,
                    message_id: messageId,
                    video_path: path,
                    thumb_path: thumbPath,
                  },
                },
              );
              const edgePayload = data as { ok?: boolean } | null;
              const edgeOk = !fnErr && edgePayload?.ok === true;

              if (!edgeOk) {
                console.error(
                  '[useMessageThread] generate-message-video-poster: fallback to client poster',
                  fnErr
                    ? supabaseClientErrorMessage(fnErr)
                    : 'invoke returned no error but response was not ok',
                );
                let poster: Awaited<ReturnType<typeof captureVideoPoster>>;
                try {
                  poster = await captureVideoPoster(file);
                } catch (e) {
                  console.error(
                    '[useMessageThread] video poster fallback',
                    supabaseClientErrorMessage(e),
                  );
                  setError(e instanceof Error ? e.message : 'Could not read video.');
                  await abortAttempt();
                  return false;
                }
                const { error: upPoster } = await supabase.storage
                  .from(MESSAGE_ATTACHMENTS_BUCKET)
                  .upload(thumbPath, poster.blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg',
                  });
                if (upPoster) {
                  console.error(
                    '[useMessageThread] poster upload',
                    supabaseClientErrorMessage(upPoster),
                  );
                  setError(formatUserFacingError(upPoster));
                  await abortAttempt();
                  return false;
                }
                thumb_path = thumbPath;
                width = poster.width;
                height = poster.height;
                duration_sec = poster.duration_sec;
              }
            } else {
              let poster: Awaited<ReturnType<typeof captureVideoPoster>>;
              try {
                poster = await captureVideoPoster(file);
              } catch (e) {
                console.error('[useMessageThread] video poster', supabaseClientErrorMessage(e));
                setError(e instanceof Error ? e.message : 'Could not read video.');
                await abortAttempt();
                return false;
              }
              const { error: upPoster } = await supabase.storage
                .from(MESSAGE_ATTACHMENTS_BUCKET)
                .upload(thumbPath, poster.blob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: 'image/jpeg',
                });
              if (upPoster) {
                console.error(
                  '[useMessageThread] poster upload',
                  supabaseClientErrorMessage(upPoster),
                );
                setError(formatUserFacingError(upPoster));
                await abortAttempt();
                return false;
              }
              thumb_path = thumbPath;
              width = poster.width;
              height = poster.height;
              duration_sec = poster.duration_sec;
            }

            meta.push({
              id: crypto.randomUUID(),
              kind: 'video',
              path,
              thumb_path,
              file_name: file.name,
              mime_type: file.type || inferMimeFromFileName(file.name) || 'video/mp4',
              size_bytes: file.size,
              uploaded_at: new Date().toISOString(),
              width,
              height,
              duration_sec,
            });
          }
        }

        if (meta.length > 0) {
          const attachmentsJson = attachmentsToJson(meta);
          const { error: updErr } = await supabase
            .from('messages')
            .update({ attachments: attachmentsJson })
            .eq('id', messageId);
          if (updErr) {
            console.error(
              '[useMessageThread] message attachments update',
              supabaseClientErrorMessage(updErr),
            );
            setError(formatUserFacingError(updErr));
            await abortAttempt();
            return false;
          }
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], attachments: attachmentsJson as MessageRow['attachments'] };
            return next;
          });
        }

        const { data: self } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', user.id)
          .maybeSingle();
        if (self) {
          setUserById((prev) => ({ ...prev, [self.id]: toChatUserSnapshot(self) }));
        }
        return true;
      } finally {
        setSending(false);
      }
    },
    [bubbles, canPostMessages, filter, messages, taskBubbleId, workspaceId],
  );

  return {
    messages,
    userById,
    teamMembers,
    replyCounts,
    isLoading,
    error,
    sending,
    sendMessage,
    clearError,
    setError,
  };
}
