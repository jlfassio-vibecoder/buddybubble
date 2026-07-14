import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import {
  applyPersonalCuesViaServiceRole,
  parseSavePersonalCuesBody,
  resolveDictionaryIdForPersonalSave,
} from '@/lib/workout-factory/save-personal-exercise-cues-server';

/**
 * Authenticated wrapper: persist micro-edited cues to `user_exercise_notes`
 * via service-role `apply_personal_cues_for_user`.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const body = parseSavePersonalCuesBody(raw);
    if (!body) {
      return NextResponse.json(
        { error: 'exercise_name and at least one non-empty cue field are required' },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    let dictionaryId: string;
    try {
      dictionaryId = await resolveDictionaryIdForPersonalSave(service, {
        exerciseName: body.exercise_name,
        dictionaryIdHint: body.dictionary_id,
        userId: user.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'invalid_dictionary_id' || msg === 'dictionary_id_not_found') {
        return NextResponse.json({ error: 'Invalid dictionary id' }, { status: 400 });
      }
      if (msg === 'exercise_name_required') {
        return NextResponse.json({ error: 'Exercise name is required' }, { status: 400 });
      }
      console.warn('[exercise-cues/save-personal] dictionary resolve failed:', msg);
      return NextResponse.json(
        { error: 'Could not resolve exercise catalog entry' },
        { status: 500 },
      );
    }

    try {
      const written = await applyPersonalCuesViaServiceRole(service, {
        userId: user.id,
        dictionaryId,
        patch: body.patch,
        mode: body.mode,
      });
      if (written < 1) {
        return NextResponse.json({ error: 'No cue fields were saved' }, { status: 400 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[exercise-cues/save-personal] apply_personal_cues_for_user failed:', msg);
      return NextResponse.json({ error: 'Could not save to your notes' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dictionary_id: dictionaryId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[exercise-cues/save-personal] unexpected:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
