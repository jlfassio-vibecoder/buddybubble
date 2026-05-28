import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { mergeCoachOutlineMetadataPatch } from '@/lib/agents/coach/coach-outline-metadata';
import {
  resolveTaskOutlineUserMessage,
  type OutlineUserMessageSource,
} from '@/lib/agents/coach/resolve-task-outline-user-message';
import { applyCoachWorkoutOutlineToTaskMetadata } from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import { runCoachOutlinePhaseBVertex } from '@/lib/ai/coach-outline-phase-b-vertex';
import { parseTaskMetadata } from '@/lib/item-metadata';
import {
  resolveSubscriptionPermissions,
  type SubscriptionStatus,
} from '@/lib/subscription-permissions';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { normalizeItemType } from '@/lib/item-types';
import type { TaskRow, WorkspaceCategory } from '@/types/database';

export const maxDuration = 120;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const OUTLINE_GENERATION_USER_ERROR =
  'Structure generation failed. Try again or add blocks manually.';

const OUTLINE_TRUNCATED_USER_ERROR =
  'The workout outline was too long and got cut off. Please try asking for fewer blocks.';

const AI_GENERATION_FAILED_CLIENT_BODY = {
  error: 'AI_GENERATION_FAILED',
  message: 'The workout generator is currently unavailable. Please try again.',
} as const;

type RequestBody = {
  workspace_id?: string;
  task_id?: string;
  user_message?: string;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: Request) {
  const logPrefix = '[generate-workout-outline]';

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
    const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : '';
    const userMessage =
      typeof body.user_message === 'string' && body.user_message.trim()
        ? body.user_message.trim().slice(0, 2000)
        : undefined;

    if (!workspaceId || !isUuid(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 });
    }
    if (!taskId || !isUuid(taskId)) {
      return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
    }

    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('category_type')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Socialspace not found' }, { status: 404 });
    }

    const { data: subRow } = await supabase
      .from('workspace_subscriptions')
      .select('status')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const subStatus = (subRow?.status as SubscriptionStatus | undefined) ?? null;
    const perms = resolveSubscriptionPermissions(
      workspace.category_type as WorkspaceCategory,
      subStatus,
    );

    if (!perms.canUseAI) {
      return NextResponse.json(
        {
          error: 'AI generation requires an active subscription or trial for this socialspace.',
          code: 'AI_SUBSCRIPTION_REQUIRED',
        },
        { status: 403, headers: JSON_HEADERS },
      );
    }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, bubble_id, metadata, title, description, item_type, created_at')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (normalizeItemType(task.item_type) !== 'workout') {
      return NextResponse.json(
        { error: 'Outline generation is only supported for workout tasks.' },
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const { data: bubble, error: bubbleError } = await supabase
      .from('bubbles')
      .select('workspace_id')
      .eq('id', task.bubble_id)
      .single();

    if (bubbleError || !bubble || bubble.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: 'Task does not belong to this socialspace' },
        { status: 400 },
      );
    }

    const title = typeof task.title === 'string' ? task.title.trim() : '';
    const description = typeof task.description === 'string' ? task.description.trim() : '';

    if (!title && !description) {
      return NextResponse.json(
        { error: 'Task needs a title or description before generating structure.' },
        { status: 400 },
      );
    }

    const generatingMeta = mergeCoachOutlineMetadataPatch(task.metadata, {
      status: 'generating',
      error: null,
      clearConfirmation: true,
    });

    const { error: generatingUpdateErr } = await supabase
      .from('tasks')
      .update({ metadata: generatingMeta as TaskRow['metadata'] })
      .eq('id', taskId);

    if (generatingUpdateErr) {
      console.error(`${logPrefix} tasks generating update:`, generatingUpdateErr);
      return NextResponse.json({ error: 'Could not update task' }, { status: 500 });
    }

    const creds = await getVertexAICredentials(logPrefix);
    if ('error' in creds) {
      return creds.error;
    }

    let resolvedUserMessage = userMessage;
    let contextSource: OutlineUserMessageSource = userMessage ? 'client_body' : 'none';

    if (!resolvedUserMessage) {
      const resolved = await resolveTaskOutlineUserMessage(supabase, {
        taskId,
        bubbleId: task.bubble_id,
        taskCreatedAt: task.created_at,
      });
      resolvedUserMessage = resolved.userMessage;
      contextSource = resolved.source;
    }

    console.warn(`${logPrefix} phase b context`, {
      task_id: taskId,
      context_source: contextSource,
      user_message_chars: resolvedUserMessage?.length ?? 0,
    });

    const phaseResult = await runCoachOutlinePhaseBVertex({
      title,
      description,
      userMessage: resolvedUserMessage,
      projectId: creds.projectId,
      accessToken: creds.accessToken,
      logPrefix,
    });

    let nextMeta: Record<string, unknown>;
    if (phaseResult.ok) {
      const withOutline = applyCoachWorkoutOutlineToTaskMetadata(task.metadata, phaseResult.blocks);
      nextMeta = mergeCoachOutlineMetadataPatch(withOutline, {
        status: 'ready',
        error: null,
        drops: phaseResult.drops,
        clearConfirmation: true,
      });
    } else {
      const truncated = phaseResult.errorKind === 'truncated';
      console.error(`${logPrefix} phase b failed:`, phaseResult.message, {
        task_id: taskId,
        error_kind: phaseResult.errorKind,
        drop_count: phaseResult.drops?.length ?? 0,
        drops: phaseResult.drops ?? [],
      });
      nextMeta = mergeCoachOutlineMetadataPatch(task.metadata, {
        status: 'needs_structure',
        error: truncated ? OUTLINE_TRUNCATED_USER_ERROR : OUTLINE_GENERATION_USER_ERROR,
        drops: phaseResult.drops ?? [],
        clearConfirmation: true,
      });
    }

    const { error: updateErr } = await supabase
      .from('tasks')
      .update({ metadata: nextMeta as TaskRow['metadata'] })
      .eq('id', taskId);

    if (updateErr) {
      console.error(`${logPrefix} tasks update:`, updateErr);
      return NextResponse.json({ error: 'Could not update task' }, { status: 500 });
    }

    if (!phaseResult.ok) {
      if (phaseResult.errorKind === 'truncated') {
        return NextResponse.json(
          {
            error: 'OUTLINE_TRUNCATED',
            message: OUTLINE_TRUNCATED_USER_ERROR,
            metadata: parseTaskMetadata(nextMeta),
          },
          { status: 422, headers: JSON_HEADERS },
        );
      }
      return NextResponse.json(
        {
          ...AI_GENERATION_FAILED_CLIENT_BODY,
          metadata: parseTaskMetadata(nextMeta),
        },
        { status: 502, headers: JSON_HEADERS },
      );
    }

    return NextResponse.json(
      { metadata: parseTaskMetadata(nextMeta) },
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${logPrefix} unhandled:`, msg);
    return NextResponse.json(AI_GENERATION_FAILED_CLIENT_BODY, {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
