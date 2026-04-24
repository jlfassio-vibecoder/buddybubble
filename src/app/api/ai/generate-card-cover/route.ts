import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { buildCardCoverImagePrompt } from '@/lib/ai/card-cover-prompt';
import { generateSceneBrief } from '@/lib/ai/scene-brief-generator';
import {
  predictImagenImageBytes,
  resolveVertexImageLocation,
  resolveVertexImagenModelId,
} from '@/lib/ai/vertex-image-gen';
import { trackServerEvent } from '@/lib/analytics/server';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
} from '@/lib/item-metadata';
import {
  resolveSubscriptionPermissions,
  type SubscriptionStatus,
} from '@/lib/subscription-permissions';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { normalizeItemType } from '@/lib/item-types';
import type { TaskRow, WorkspaceCategory } from '@/types/database';

export const maxDuration = 300;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

type RequestBody = {
  workspace_id?: string;
  task_id?: string;
  hint?: string;
  /** Scene archetype from `CARD_COVER_PRESET_GROUPS`; omit for server default by item type. */
  preset_id?: string;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Cap for Gemini/Imagen context (between 5–10 per product spec). */
const MAX_EXERCISES_FOR_CARD_COVER = 8;

/**
 * Array of exercise labels (name, plus equipment in parens if present) from
 * `metadata.exercises` or, when empty, `metadata.workout_factory_workout.exercises`.
 * The caller joins for the scene-brief input.
 */
function extractExerciseLabelsForCardCover(taskMetadata: unknown): string[] {
  const fromForm = metadataFieldsFromParsed(taskMetadata).workoutExercises;
  const fromArray = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x !== 'object' || x === null) continue;
      const o = x as { name?: unknown; equipment?: unknown };
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) continue;
      const eq = typeof o.equipment === 'string' && o.equipment.trim() ? o.equipment.trim() : '';
      out.push(eq ? `${name} (${eq})` : name);
    }
    return out;
  };
  if (fromForm.length > 0) {
    return fromForm
      .map((ex) => {
        const name = ex.name.trim();
        if (!name) return '';
        const eq =
          typeof ex.equipment === 'string' && ex.equipment.trim() ? ex.equipment.trim() : '';
        return eq ? `${name} (${eq})` : name;
      })
      .filter(Boolean);
  }
  const o = parseTaskMetadata(taskMetadata) as Record<string, unknown>;
  const nested = o.workout_factory_workout;
  if (typeof nested === 'object' && nested !== null) {
    return fromArray((nested as { exercises?: unknown }).exercises);
  }
  return [];
}

export async function POST(req: Request) {
  const logPrefix = '[generate-card-cover]';

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
    const hint =
      typeof body.hint === 'string' && body.hint.trim()
        ? body.hint.trim().slice(0, 220)
        : undefined;
    const presetIdRaw = typeof body.preset_id === 'string' ? body.preset_id.trim() : '';
    const preset_id = presetIdRaw ? presetIdRaw.slice(0, 120) : undefined;

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
      .select('id, bubble_id, metadata, item_type, title, description')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
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

    const itemType = normalizeItemType(task.item_type);
    const title = typeof task.title === 'string' ? task.title : '';
    const description =
      typeof task.description === 'string' && task.description ? task.description : '';

    const creds = await getVertexAICredentials(logPrefix);
    if ('error' in creds) {
      return creds.error;
    }

    const exerciseLabels = extractExerciseLabelsForCardCover(task.metadata).slice(
      0,
      MAX_EXERCISES_FOR_CARD_COVER,
    );
    const extractedExercises = exerciseLabels.join(', ');

    let sceneBrief: string;
    try {
      sceneBrief = await generateSceneBrief(
        {
          title,
          description: description || undefined,
          itemType,
          ...(extractedExercises ? { exercises: extractedExercises } : {}),
        },
        { projectId: creds.projectId, accessToken: creds.accessToken },
        { logPrefix },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${logPrefix} scene brief failed:`, msg);
      return NextResponse.json(
        { error: 'Could not prepare cover description. Try again later.' },
        { status: 502 },
      );
    }

    const prompt = buildCardCoverImagePrompt({
      sceneBrief,
      itemType,
      hint,
      presetId: preset_id,
    });

    const tGen = Date.now();
    let imageBytes: Buffer;
    try {
      imageBytes = await predictImagenImageBytes({
        projectId: creds.projectId,
        accessToken: creds.accessToken,
        prompt,
        aspectRatio: '16:9',
        logPrefix,
        timeoutMs: 120000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${logPrefix} Imagen failed:`, msg);
      return NextResponse.json(
        { error: 'Could not generate image. Try again later.' },
        { status: 502 },
      );
    }

    if (imageBytes.length > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Generated image is too large' }, { status: 502 });
    }

    const path = buildTaskAttachmentObjectPath(workspaceId, taskId, 'ai-card-cover.png');
    const blob = new Blob([new Uint8Array(imageBytes)], { type: 'image/png' });

    const { error: upErr } = await supabase.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/png',
      });

    if (upErr) {
      console.error(`${logPrefix} storage upload:`, upErr.message || upErr);
      return NextResponse.json(
        {
          error: 'Could not save cover image',
          ...(process.env.NODE_ENV === 'development'
            ? { detail: upErr.message || String(upErr) }
            : {}),
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const fields = metadataFieldsFromParsed(task.metadata);
    const previousPath = fields.cardCoverPath.trim();
    const metaPayload = buildTaskMetadataPayload(
      itemType,
      { ...fields, cardCoverPath: path },
      task.metadata,
    );

    const { error: updateErr } = await supabase
      .from('tasks')
      .update({ metadata: metaPayload as TaskRow['metadata'] })
      .eq('id', taskId);

    if (updateErr) {
      console.error(`${logPrefix} tasks update:`, updateErr);
      void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([path]);
      return NextResponse.json({ error: 'Could not update task' }, { status: 500 });
    }

    if (previousPath && previousPath !== path) {
      void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([previousPath]);
    }

    const ms = Date.now() - tGen;
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${logPrefix} ok task=${taskId} user=${user.id} bytes=${imageBytes.length} ms=${ms} region=${resolveVertexImageLocation()} model=${resolveVertexImagenModelId()}`,
      );
    }

    void trackServerEvent('premium_feature_used', {
      workspaceId,
      userId: user.id,
      metadata: { source: 'ai_card_cover', task_id: taskId },
    });

    return NextResponse.json({
      card_cover_path: path,
      metadata: metaPayload,
    });
  } catch (err) {
    console.error('[generate-card-cover] unexpected:', err);
    const detail =
      process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : undefined;
    return NextResponse.json(
      { error: 'Unexpected error', ...(detail ? { detail } : {}) },
      { status: 500, headers: JSON_HEADERS },
    );
  }
}
