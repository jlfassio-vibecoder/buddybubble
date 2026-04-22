'use server';

/**
 * Trial & Member Access — Server Actions for the normalized permission tables
 * created in `supabase/migrations/20260629120000_workspace_role_access_tables.sql`.
 *
 * Pattern mirrors `updateWorkspaceSettingsAction` in `workspace-settings-actions.ts`:
 *   - Server-side Supabase client via `@utils/supabase/server`
 *   - RLS is the authoritative gate (owner/admin via `is_workspace_admin`)
 *   - Returns `{ ok: true } | { error: string }` for ergonomic UI handling
 *
 * Editable role surface is intentionally narrow (`trialing | member`) — the
 * settings UI only exposes those two; widening must be a deliberate change here.
 */

import { createClient } from '@utils/supabase/server';
import { formatUserFacingError } from '@/lib/format-error';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';

export type TrialMemberEditableRole = 'trialing' | 'member';
const EDITABLE_ROLES: ReadonlyArray<TrialMemberEditableRole> = ['trialing', 'member'];

/** App-owned feature key allow-list. Mirrors `TRIAL_MEMBER_FEATURE_KEYS` in the UI module. */
const ALLOWED_FEATURE_KEYS: ReadonlySet<string> = new Set([
  'ai',
  'live_video',
  'analytics',
  'export',
]);

export type TrialMemberAccessActionResult = { ok: true } | { error: string };

function ensureEditableRole(role: string): role is TrialMemberEditableRole {
  return (EDITABLE_ROLES as ReadonlyArray<string>).includes(role);
}

function isMissingTableError(err: unknown, table: string): boolean {
  // Falls through both PostgREST schema-cache misses and direct undefined-table errors.
  if (isMissingColumnSchemaCacheError(err, table)) return true;
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  // 42P01 = undefined_table; PostgREST often surfaces this as PGRST205/PGRST106 too.
  if (code === '42P01') return true;
  return /relation .*?\b(public\.)?(workspace_role_feature_flags|workspace_role_default_bubbles)\b.*? does not exist/i.test(
    msg,
  );
}

function noPermissionMessage(): string {
  return 'Could not save. Only owners and admins can change Trial & Member Access settings.';
}

function migrationPendingMessage(): string {
  return 'Trial & Member Access tables are not available yet. Apply the latest Supabase migration, then try again.';
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export type UpsertFeatureFlagInput = {
  workspaceId: string;
  role: TrialMemberEditableRole;
  featureKey: string;
  isEnabled: boolean;
};

export async function upsertWorkspaceRoleFeatureFlagAction(
  input: UpsertFeatureFlagInput,
): Promise<TrialMemberAccessActionResult> {
  if (!input.workspaceId) return { error: 'Missing workspace.' };
  if (!ensureEditableRole(input.role)) {
    return { error: `Role "${input.role}" cannot be edited from this surface.` };
  }
  const featureKey = String(input.featureKey ?? '').trim();
  if (!featureKey) return { error: 'Missing feature key.' };
  if (!ALLOWED_FEATURE_KEYS.has(featureKey)) {
    return { error: `Unknown feature "${featureKey}".` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('workspace_role_feature_flags')
    .upsert(
      {
        workspace_id: input.workspaceId,
        role: input.role,
        feature_key: featureKey,
        is_enabled: !!input.isEnabled,
      },
      { onConflict: 'workspace_id,role,feature_key' },
    )
    .select('feature_key');

  if (error) {
    if (isMissingTableError(error, 'workspace_role_feature_flags')) {
      return { error: migrationPendingMessage() };
    }
    return { error: formatUserFacingError(error) };
  }

  // RLS will silently reject non-admin upserts; .select() will return an empty array.
  if (!data || data.length === 0) {
    return { error: noPermissionMessage() };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Default bubbles
// ---------------------------------------------------------------------------

export type SetDefaultBubbleInput = {
  workspaceId: string;
  role: TrialMemberEditableRole;
  bubbleId: string;
  /** true → ensure row exists; false → ensure row removed */
  enabled: boolean;
};

export async function setWorkspaceRoleDefaultBubbleAction(
  input: SetDefaultBubbleInput,
): Promise<TrialMemberAccessActionResult> {
  if (!input.workspaceId) return { error: 'Missing workspace.' };
  if (!input.bubbleId) return { error: 'Missing bubble.' };
  if (!ensureEditableRole(input.role)) {
    return { error: `Role "${input.role}" cannot be edited from this surface.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  if (input.enabled) {
    const { data, error } = await supabase
      .from('workspace_role_default_bubbles')
      .upsert(
        {
          workspace_id: input.workspaceId,
          role: input.role,
          bubble_id: input.bubbleId,
        },
        { onConflict: 'workspace_id,role,bubble_id' },
      )
      .select('bubble_id');

    if (error) {
      if (isMissingTableError(error, 'workspace_role_default_bubbles')) {
        return { error: migrationPendingMessage() };
      }
      // Foreign key violation — bubble was deleted between fetch and click, etc.
      const code =
        typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';
      if (code === '23503') {
        return { error: 'That bubble no longer exists in this workspace.' };
      }
      return { error: formatUserFacingError(error) };
    }
    if (!data || data.length === 0) {
      return { error: noPermissionMessage() };
    }
    return { ok: true };
  }

  // enabled === false → delete the row
  const { data, error } = await supabase
    .from('workspace_role_default_bubbles')
    .delete()
    .match({
      workspace_id: input.workspaceId,
      role: input.role,
      bubble_id: input.bubbleId,
    })
    .select('bubble_id');

  if (error) {
    if (isMissingTableError(error, 'workspace_role_default_bubbles')) {
      return { error: migrationPendingMessage() };
    }
    return { error: formatUserFacingError(error) };
  }

  // delete + .select() returns the deleted rows; an empty result here is ambiguous
  // (already gone OR RLS rejected). We treat "already gone" as success and only
  // surface a permission error if the caller is clearly not allowed to read it back
  // either. To stay deterministic and match upsert behavior, treat empty as success
  // for delete: the desired end state (no row) is met.
  void data;
  return { ok: true };
}
