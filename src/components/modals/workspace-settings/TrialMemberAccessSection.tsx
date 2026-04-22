'use client';

/**
 * Trial & Member Access — settings section.
 *
 * Owner/admin-only. Backed by the normalized tables created in
 * `supabase/migrations/20260629120000_workspace_role_access_tables.sql`:
 *   - `workspace_role_feature_flags`     → per-role feature toggles
 *   - `workspace_role_default_bubbles`   → per-role default bubble allow-list
 *
 * Pattern mirrors the parent `WorkspaceSettingsModal`:
 *   - Reads via the browser Supabase client (RLS allows any workspace member to SELECT)
 *   - Writes via Server Actions in `@/app/(dashboard)/trial-member-access-actions`
 *     (RLS restricts INSERT/UPDATE/DELETE to owner+admin)
 *
 * Optimistic UI on toggles; rolls back + surfaces an inline error if the action fails.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';
import {
  setWorkspaceRoleDefaultBubbleAction,
  upsertWorkspaceRoleFeatureFlagAction,
} from '@/app/(dashboard)/trial-member-access-actions';

const EDITABLE_ROLES = ['trialing', 'member'] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

const ROLE_LABELS: Record<EditableRole, string> = {
  trialing: 'Trialing (Storefront Lead — reverse trial)',
  member: 'Member (paying / onboarded)',
};

/**
 * Canonical feature keys for the Trial & Member Access surface.
 * Kept in app code so new flags do not require DB migrations (table is TEXT).
 * Must match `ALLOWED_FEATURE_KEYS` in `trial-member-access-actions.ts`.
 */
export const TRIAL_MEMBER_FEATURE_KEYS = ['ai', 'live_video', 'analytics', 'export'] as const;
export type TrialMemberFeatureKey = (typeof TRIAL_MEMBER_FEATURE_KEYS)[number];

const FEATURE_LABELS: Record<TrialMemberFeatureKey, string> = {
  ai: 'AI tools',
  live_video: 'Live video / streaming',
  analytics: 'Analytics dashboard',
  export: 'Data export',
};

const FEATURE_DESCRIPTIONS: Record<TrialMemberFeatureKey, string> = {
  ai: 'Workout generation, card cover images, personalization.',
  live_video: 'Start or join live sessions from chat.',
  analytics: 'View workspace-wide analytics dashboards.',
  export: 'Export tasks, logs, and reports.',
};

/** Bubble types we exclude from the picker — DMs and per-lead trial bubbles are not shareable defaults. */
const HIDDEN_BUBBLE_TYPES: ReadonlySet<string> = new Set(['dm', 'trial']);

type BubbleOption = {
  id: string;
  name: string;
  bubble_type: string;
  is_private: boolean;
};

type FlagsByRole = Record<EditableRole, Partial<Record<TrialMemberFeatureKey, boolean>>>;
type DefaultBubblesByRole = Record<EditableRole, Set<string>>;

type Props = {
  workspaceId: string;
  /** Must be true for the section to render at all. */
  canManage: boolean;
};

export function TrialMemberAccessSection({ workspaceId, canManage }: Props) {
  const [activeRole, setActiveRole] = useState<EditableRole>('trialing');

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [flagsByRole, setFlagsByRole] = useState<FlagsByRole>({
    trialing: {},
    member: {},
  });
  const [defaultBubblesByRole, setDefaultBubblesByRole] = useState<DefaultBubblesByRole>({
    trialing: new Set(),
    member: new Set(),
  });
  const [bubbleOptions, setBubbleOptions] = useState<BubbleOption[]>([]);

  /** Tracks in-flight mutations to disable individual controls + show spinners. */
  const [pendingFlagKeys, setPendingFlagKeys] = useState<Set<string>>(new Set());
  const [pendingBubbleKeys, setPendingBubbleKeys] = useState<Set<string>>(new Set());

  // Avoid setState on unmount (modal close mid-fetch).
  const mountedRef = useRef<boolean>(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!canManage || !workspaceId) return;
    setLoading(true);
    setLoadError(null);
    setActionError(null);

    const supabase = createClient();
    const editableRoles = EDITABLE_ROLES as ReadonlyArray<string>;

    const [flagsRes, defaultsRes, bubblesRes] = await Promise.all([
      supabase
        .from('workspace_role_feature_flags')
        .select('role, feature_key, is_enabled')
        .eq('workspace_id', workspaceId)
        .in('role', editableRoles as string[]),
      supabase
        .from('workspace_role_default_bubbles')
        .select('role, bubble_id')
        .eq('workspace_id', workspaceId)
        .in('role', editableRoles as string[]),
      supabase
        .from('bubbles')
        .select('id, name, bubble_type, is_private')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true }),
    ]);

    if (!mountedRef.current) return;

    const firstErr = flagsRes.error || defaultsRes.error || bubblesRes.error;
    if (firstErr) {
      setLoading(false);
      setLoadError(formatUserFacingError(firstErr));
      return;
    }

    const nextFlags: FlagsByRole = { trialing: {}, member: {} };
    for (const row of (flagsRes.data ?? []) as Array<{
      role: string;
      feature_key: string;
      is_enabled: boolean;
    }>) {
      if (!isEditableRole(row.role)) continue;
      if (!isKnownFeatureKey(row.feature_key)) continue;
      nextFlags[row.role][row.feature_key] = !!row.is_enabled;
    }

    const nextDefaults: DefaultBubblesByRole = {
      trialing: new Set(),
      member: new Set(),
    };
    for (const row of (defaultsRes.data ?? []) as Array<{ role: string; bubble_id: string }>) {
      if (!isEditableRole(row.role)) continue;
      nextDefaults[row.role].add(row.bubble_id);
    }

    const visibleBubbles = ((bubblesRes.data ?? []) as BubbleOption[]).filter(
      (b) => !HIDDEN_BUBBLE_TYPES.has(b.bubble_type),
    );

    setFlagsByRole(nextFlags);
    setDefaultBubblesByRole(nextDefaults);
    setBubbleOptions(visibleBubbles);
    setLoading(false);
  }, [canManage, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flagPendingKey = useCallback(
    (role: EditableRole, feature: TrialMemberFeatureKey) => `${role}:${feature}`,
    [],
  );
  const bubblePendingKey = useCallback(
    (role: EditableRole, bubbleId: string) => `${role}:${bubbleId}`,
    [],
  );

  const handleToggleFlag = useCallback(
    async (feature: TrialMemberFeatureKey, nextEnabled: boolean) => {
      const role = activeRole;
      const pendingKey = flagPendingKey(role, feature);
      const previous = flagsByRole[role][feature] ?? false;

      setActionError(null);
      setPendingFlagKeys((prev) => new Set(prev).add(pendingKey));
      setFlagsByRole((prev) => ({
        ...prev,
        [role]: { ...prev[role], [feature]: nextEnabled },
      }));

      const result = await upsertWorkspaceRoleFeatureFlagAction({
        workspaceId,
        role,
        featureKey: feature,
        isEnabled: nextEnabled,
      });

      if (!mountedRef.current) return;

      setPendingFlagKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });

      if ('error' in result) {
        setFlagsByRole((prev) => ({
          ...prev,
          [role]: { ...prev[role], [feature]: previous },
        }));
        setActionError(result.error);
      }
    },
    [activeRole, flagPendingKey, flagsByRole, workspaceId],
  );

  const handleToggleBubble = useCallback(
    async (bubbleId: string, nextEnabled: boolean) => {
      const role = activeRole;
      const pendingKey = bubblePendingKey(role, bubbleId);
      const previousSet = defaultBubblesByRole[role];
      const wasEnabled = previousSet.has(bubbleId);

      setActionError(null);
      setPendingBubbleKeys((prev) => new Set(prev).add(pendingKey));
      setDefaultBubblesByRole((prev) => {
        const nextSet = new Set(prev[role]);
        if (nextEnabled) nextSet.add(bubbleId);
        else nextSet.delete(bubbleId);
        return { ...prev, [role]: nextSet };
      });

      const result = await setWorkspaceRoleDefaultBubbleAction({
        workspaceId,
        role,
        bubbleId,
        enabled: nextEnabled,
      });

      if (!mountedRef.current) return;

      setPendingBubbleKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });

      if ('error' in result) {
        setDefaultBubblesByRole((prev) => {
          const nextSet = new Set(prev[role]);
          if (wasEnabled) nextSet.add(bubbleId);
          else nextSet.delete(bubbleId);
          return { ...prev, [role]: nextSet };
        });
        setActionError(result.error);
      }
    },
    [activeRole, bubblePendingKey, defaultBubblesByRole, workspaceId],
  );

  const activeFlags = flagsByRole[activeRole];
  const activeDefaultBubbles = defaultBubblesByRole[activeRole];

  const sortedBubbles = useMemo(() => {
    return [...bubbleOptions].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [bubbleOptions]);

  if (!canManage) return null;

  return (
    <section
      aria-labelledby="trial-member-access-heading"
      className="space-y-4"
      data-workspace-id={workspaceId}
    >
      <div>
        <h3
          id="trial-member-access-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          Trial & Member Access
        </h3>
        <p className="text-xs text-muted-foreground">
          Fine-grained controls for what Trialing and Member roles can do. Baseline access (manual
          Kanban cards, Workout Player updates, messaging in granted bubbles) is always on.
        </p>
      </div>

      <div
        className="inline-flex rounded-md border border-input bg-background p-0.5"
        role="group"
        aria-label="Role scope"
      >
        {EDITABLE_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            aria-pressed={activeRole === role}
            disabled={loading}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              activeRole === role
                ? 'bg-[color:var(--sidebar-active)] text-[var(--primary-foreground)]'
                : 'text-muted-foreground hover:bg-muted',
              loading && 'cursor-wait opacity-60',
            )}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Feature toggles
        </Label>
        <ul className="divide-y divide-border rounded-md border border-border">
          {TRIAL_MEMBER_FEATURE_KEYS.map((feature) => {
            const checked = Boolean(activeFlags[feature]);
            const isPending = pendingFlagKeys.has(flagPendingKey(activeRole, feature));
            return (
              <li key={feature} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{FEATURE_LABELS[feature]}</p>
                  <p className="text-xs text-muted-foreground">{FEATURE_DESCRIPTIONS[feature]}</p>
                </div>
                <label
                  className={cn(
                    'mt-0.5 inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground',
                    (loading || isPending) && 'cursor-wait opacity-70',
                  )}
                >
                  {isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={checked}
                    disabled={loading || isPending}
                    onChange={(e) => void handleToggleFlag(feature, e.target.checked)}
                    aria-label={`${FEATURE_LABELS[feature]} for ${ROLE_LABELS[activeRole]}`}
                  />
                  <span>{checked ? 'Enabled' : 'Disabled'}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Default bubbles
        </Label>
        <p className="text-xs text-muted-foreground">
          Bubbles selected here will be surfaced to {ROLE_LABELS[activeRole]} members by default.
          Direct messages and per-lead trial bubbles are excluded.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading bubbles…
          </div>
        ) : sortedBubbles.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            No shareable bubbles yet. Create a community bubble to assign defaults.
          </div>
        ) : (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {sortedBubbles.map((bubble) => {
              const checked = activeDefaultBubbles.has(bubble.id);
              const isPending = pendingBubbleKeys.has(bubblePendingKey(activeRole, bubble.id));
              return (
                <li key={bubble.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{bubble.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {bubble.is_private ? 'Private' : 'Open'} · {bubble.bubble_type}
                    </p>
                  </div>
                  <label
                    className={cn(
                      'inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground',
                      isPending && 'cursor-wait opacity-70',
                    )}
                  >
                    {isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={checked}
                      disabled={isPending}
                      onChange={(e) => void handleToggleBubble(bubble.id, e.target.checked)}
                      aria-label={`Default bubble ${bubble.name} for ${ROLE_LABELS[activeRole]}`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function isEditableRole(role: string): role is EditableRole {
  return (EDITABLE_ROLES as ReadonlyArray<string>).includes(role);
}

function isKnownFeatureKey(key: string): key is TrialMemberFeatureKey {
  return (TRIAL_MEMBER_FEATURE_KEYS as ReadonlyArray<string>).includes(key);
}
