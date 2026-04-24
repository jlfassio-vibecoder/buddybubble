'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  useClassSaveAndCreate,
  type ClassSavePayload,
} from '@/components/modals/class-modal/hooks/useClassSaveAndCreate';
import { PrivacyToggle } from '@/components/ui/privacy-toggle';
import { mergeClassInstanceDeckSessionMetadata } from '@/lib/card-live-session-metadata';
import {
  parseAsyncSessionFromInstanceMetadata,
  parseLiveSessionInviteFromMessageMetadata,
} from '@/types/live-session-invite';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';
import { ClassEditorWorkoutPicker } from '@/components/modals/class-modal/ClassEditorWorkoutPicker';

type ClassEditorLiveDeckInnerProps = {
  workspaceId: string;
  canWrite: boolean;
};

function ClassEditorLiveDeckInner({ workspaceId, canWrite }: ClassEditorLiveDeckInnerProps) {
  const { isSelectingFromBoard, activeSnapshotId } = useWorkoutDeckSelection();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (isSelectingFromBoard) return;
    console.log('[DEBUG] Rendering Class Exercise Canvas', {
      activeDeckItemId: activeSnapshotId,
    });
  }, [isSelectingFromBoard, activeSnapshotId]);

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Class workout deck
      </p>
      <SessionDeckBuilder state={initialSessionState} />
      {isSelectingFromBoard ? (
        <ClassEditorWorkoutPicker workspaceId={workspaceId} />
      ) : (
        <div className="flex min-h-[min(360px,45vh)] min-h-0 flex-col gap-2">
          <LiveSessionWorkoutPlayer
            className="min-h-0 flex-1"
            workspaceId={workspaceId}
            supabase={supabase}
            canWrite={canWrite}
          />
        </div>
      )}
    </div>
  );
}

type ClassEditorLiveDeckBlockProps = {
  workspaceId: string;
  sessionId: string;
  hostUserId: string;
  canWrite: boolean;
};

function ClassEditorLiveDeckBlock({
  workspaceId,
  sessionId,
  hostUserId,
  canWrite,
}: ClassEditorLiveDeckBlockProps) {
  return (
    <WorkoutDeckSelectionProvider
      sessionIdOverride={sessionId}
      hostUserIdOverride={hostUserId}
      disableGlobalBoardBridge
    >
      <ClassEditorLiveDeckInner workspaceId={workspaceId} canWrite={canWrite} />
    </WorkoutDeckSelectionProvider>
  );
}

const INTENSITY_OPTIONS = [
  { value: '', label: 'Select intensity' },
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
] as const;

function localYmdAndTimeToIso(ymd: string, hm: string): string | null {
  if (!ymd) return null;
  const [y, mo, d] = ymd.split('-').map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  let h = 0;
  let mi = 0;
  if (hm) {
    const parts = hm.split(':');
    h = Number(parts[0]) || 0;
    mi = Number(parts[1]) || 0;
  }
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

function isoToDateAndTime(iso: string): { ymd: string; hm: string } {
  const dt = new Date(iso);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return { ymd: `${y}-${mo}-${d}`, hm: `${h}:${mi}` };
}

function parseFitnessFromOfferingMetadata(meta: unknown): {
  intensity: string;
  targetedFocus: string;
} {
  if (!meta || typeof meta !== 'object') return { intensity: '', targetedFocus: '' };
  const fitness = (meta as Record<string, unknown>).fitness;
  if (!fitness || typeof fitness !== 'object') return { intensity: '', targetedFocus: '' };
  const f = fitness as Record<string, unknown>;
  const intensity = typeof f.intensity === 'string' ? f.intensity : '';
  const tf = f.targeted_focus;
  if (Array.isArray(tf)) {
    return {
      intensity,
      targetedFocus: tf.filter((x) => typeof x === 'string').join(', '),
    };
  }
  if (typeof tf === 'string') return { intensity, targetedFocus: tf };
  return { intensity, targetedFocus: '' };
}

/** Merges editor-controlled `fitness.*` keys into existing offering metadata without dropping unknown keys. */
function applyFitnessToOfferingMetadata(
  base: Json,
  intensity: string,
  targetedFocusRaw: string,
): Json {
  const o =
    base && typeof base === 'object' && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};
  const prev =
    o.fitness && typeof o.fitness === 'object' && !Array.isArray(o.fitness)
      ? { ...(o.fitness as Record<string, unknown>) }
      : {};
  const targeted_focus = targetedFocusRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (intensity) prev.intensity = intensity;
  else delete prev.intensity;
  if (targeted_focus.length > 0) prev.targeted_focus = targeted_focus;
  else delete prev.targeted_focus;
  if (Object.keys(prev).length === 0) delete o.fitness;
  else o.fitness = prev;
  return o as Json;
}

export type ClassEditorProps = {
  workspaceId: string;
  canWrite: boolean;
  mode: 'create' | 'edit';
  instanceId?: string;
  offeringId?: string;
  onCreated?: (ids: { offeringId: string; instanceId: string }) => void;
  onSaved?: () => void;
  onClose: () => void;
  /** Nested inside TaskModal: drop outer card chrome and duplicate close row. */
  layout?: 'standalone' | 'embedded';
};

export function ClassEditor({
  workspaceId,
  canWrite,
  mode,
  instanceId,
  offeringId: offeringIdProp,
  onCreated,
  onSaved,
  onClose,
  layout = 'standalone',
}: ClassEditorProps) {
  const embedded = layout === 'embedded';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');

  const [resolvedOfferingId, setResolvedOfferingId] = useState<string | null>(
    offeringIdProp ?? null,
  );
  const [resolvedInstanceId, setResolvedInstanceId] = useState<string | null>(instanceId ?? null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [scheduledOn, setScheduledOn] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [instructorNotes, setInstructorNotes] = useState('');
  const [intensity, setIntensity] = useState<string>('');
  const [targetedFocus, setTargetedFocus] = useState('');
  const [rawOfferingMetadata, setRawOfferingMetadata] = useState<Json>({});
  const [rawInstanceMetadata, setRawInstanceMetadata] = useState<Json>({});
  const [liveStreamEnabled, setLiveStreamEnabled] = useState(false);
  const [asyncWorkoutEnabled, setAsyncWorkoutEnabled] = useState(false);
  const classWorkoutDeckScrollRef = useRef<HTMLDivElement>(null);

  const { createClass, saveClass } = useClassSaveAndCreate({
    setError,
    setSaving,
    onCreated,
    onSaved,
  });

  useEffect(() => {
    if (mode !== 'edit' || !instanceId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from('class_instances')
        .select('*, offering:class_offerings(*)')
        .eq('id', instanceId)
        .maybeSingle();

      if (cancelled) return;

      if (qErr || !data) {
        setError(formatUserFacingError(qErr ?? new Error('Could not load class')));
        setLoading(false);
        return;
      }

      const offering = data.offering as Record<string, unknown> | null;
      if (!offering?.id) {
        setError('Class offering is missing for this instance.');
        setLoading(false);
        return;
      }

      setResolvedInstanceId(data.id as string);
      setResolvedOfferingId(offering.id as string);
      setName((offering.name as string) ?? '');
      setDescription((offering.description as string) ?? '');
      setDurationMin(String((offering.duration_min as number) ?? 60));
      setLocation((offering.location as string) ?? '');
      setRawOfferingMetadata((offering.metadata as Json) ?? {});
      const instMeta = (data.metadata as Json) ?? {};
      setRawInstanceMetadata(instMeta);
      const liveInv = parseLiveSessionInviteFromMessageMetadata(instMeta);
      const asyncInv = parseAsyncSessionFromInstanceMetadata(instMeta);
      if (liveInv && !liveInv.endedAt) {
        setLiveStreamEnabled(true);
        setAsyncWorkoutEnabled(false);
      } else if (asyncInv) {
        setLiveStreamEnabled(false);
        setAsyncWorkoutEnabled(true);
      } else {
        setLiveStreamEnabled(false);
        setAsyncWorkoutEnabled(false);
      }

      const { intensity: intFromMeta, targetedFocus: tf } = parseFitnessFromOfferingMetadata(
        offering.metadata,
      );
      setIntensity(intFromMeta);
      setTargetedFocus(tf);

      setCapacity(data.capacity != null ? String(data.capacity) : '');
      setInstructorNotes((data.instructor_notes as string) ?? '');
      const { ymd, hm } = isoToDateAndTime(data.scheduled_at as string);
      setScheduledOn(ymd);
      setScheduledTime(hm);

      if (offeringIdProp && offeringIdProp !== offering.id) {
        setError('Offering id does not match this instance.');
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, instanceId, offeringIdProp]);

  const selectClassName = cn(
    'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm',
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
    'dark:bg-input/30 dark:disabled:bg-input/80',
  );

  const buildPayload = useCallback((): ClassSavePayload | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return null;
    }

    const duration = parseInt(durationMin, 10);
    if (!Number.isFinite(duration) || duration <= 0) {
      setError('Duration must be a positive number of minutes.');
      return null;
    }

    const scheduledAt = localYmdAndTimeToIso(scheduledOn, scheduledTime);
    if (!scheduledAt) {
      setError('Schedule date is required.');
      return null;
    }

    let cap: number | null = null;
    if (capacity.trim()) {
      const n = parseInt(capacity, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError('Capacity must be a positive number, or leave empty for no limit.');
        return null;
      }
      cap = n;
    }

    const offeringMetadata = applyFitnessToOfferingMetadata(
      rawOfferingMetadata,
      intensity,
      targetedFocus,
    );

    return {
      offering: {
        workspace_id: workspaceId,
        name: trimmedName,
        description: description.trim() || null,
        duration_min: duration,
        location: location.trim() || null,
        metadata: offeringMetadata,
      },
      instance: {
        workspace_id: workspaceId,
        scheduled_at: scheduledAt,
        capacity: cap,
        instructor_notes: instructorNotes.trim() || null,
        metadata: rawInstanceMetadata,
      },
    };
  }, [
    name,
    durationMin,
    scheduledOn,
    scheduledTime,
    capacity,
    description,
    location,
    instructorNotes,
    intensity,
    targetedFocus,
    workspaceId,
    rawOfferingMetadata,
    rawInstanceMetadata,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!canWrite || saving) return;
    setError(null);
    const payload = buildPayload();
    if (!payload) return;

    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const mergedInstanceMeta = mergeClassInstanceDeckSessionMetadata(payload.instance.metadata, {
      liveEnabled: liveStreamEnabled,
      asyncEnabled: asyncWorkoutEnabled,
      workspaceId,
      hostUserId: authUser?.id ?? null,
    });
    const finalPayload: ClassSavePayload = {
      ...payload,
      instance: { ...payload.instance, metadata: mergedInstanceMeta },
    };

    if (mode === 'create') {
      const ids = await createClass(finalPayload);
      if (ids) {
        setResolvedOfferingId(ids.offeringId);
        setResolvedInstanceId(ids.instanceId);
        setRawInstanceMetadata(mergedInstanceMeta);
      }
      return;
    }

    const oid = resolvedOfferingId ?? offeringIdProp;
    const iid = resolvedInstanceId ?? instanceId;
    if (!oid || !iid) {
      setError('Missing class ids for save.');
      return;
    }
    const ok = await saveClass(oid, iid, finalPayload);
    if (ok) {
      setRawInstanceMetadata(mergedInstanceMeta);
    }
  }, [
    buildPayload,
    canWrite,
    createClass,
    liveStreamEnabled,
    asyncWorkoutEnabled,
    mode,
    offeringIdProp,
    instanceId,
    resolvedOfferingId,
    resolvedInstanceId,
    saveClass,
    saving,
    workspaceId,
  ]);

  const disabledForm = !canWrite || saving || loading;
  const submitLabel = mode === 'create' ? 'Create class' : 'Save';

  const intensitySelectValue = useMemo(() => {
    const allowed = new Set<string>(INTENSITY_OPTIONS.map((o) => o.value));
    return allowed.has(intensity) ? intensity : '';
  }, [intensity]);

  const liveInviteForDeck = useMemo(
    () => parseLiveSessionInviteFromMessageMetadata(rawInstanceMetadata),
    [rawInstanceMetadata],
  );
  const asyncSessionForDeck = useMemo(
    () => parseAsyncSessionFromInstanceMetadata(rawInstanceMetadata),
    [rawInstanceMetadata],
  );

  const resolvedDeckSession = useMemo(() => {
    if (
      liveStreamEnabled &&
      liveInviteForDeck &&
      !liveInviteForDeck.endedAt &&
      liveInviteForDeck.sessionId?.trim()
    ) {
      return {
        kind: 'live' as const,
        sessionId: liveInviteForDeck.sessionId,
        hostUserId: liveInviteForDeck.hostUserId,
      };
    }
    if (asyncWorkoutEnabled && asyncSessionForDeck?.sessionId?.trim()) {
      return {
        kind: 'async' as const,
        sessionId: asyncSessionForDeck.sessionId,
        hostUserId: asyncSessionForDeck.hostUserId,
      };
    }
    return null;
  }, [liveStreamEnabled, asyncWorkoutEnabled, liveInviteForDeck, asyncSessionForDeck]);

  const showClassWorkoutDeck = mode === 'edit' && resolvedDeckSession != null;

  const sessionFeatureTogglesOn = liveStreamEnabled || asyncWorkoutEnabled;
  useEffect(() => {
    if (!sessionFeatureTogglesOn && !showClassWorkoutDeck) return;
    const el = classWorkoutDeckScrollRef.current;
    if (!el) return;
    const run = () => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    queueMicrotask(() => {
      requestAnimationFrame(run);
    });
  }, [sessionFeatureTogglesOn, showClassWorkoutDeck]);

  return (
    <div
      className={cn(
        'flex max-h-[min(90vh,720px)] flex-col overflow-hidden bg-card',
        embedded
          ? 'max-h-none rounded-none border-0 shadow-none'
          : 'rounded-xl border border-border shadow-lg',
      )}
    >
      {!embedded ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {mode === 'create' ? 'New class' : 'Edit class'}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1 overflow-y-auto py-3', embedded ? 'px-0' : 'px-4')}>
        {!canWrite && (
          <div
            className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            role="status"
          >
            Admins only — only workspace owners and admins can create or edit classes.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Fragment>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="class-name">Name</Label>
                <Input
                  id="class-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={disabledForm}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="class-description">Description</Label>
                <Textarea
                  id="class-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={disabledForm}
                  rows={3}
                  className="min-h-[4.5rem] resize-y"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="class-duration">Duration (minutes)</Label>
                  <Input
                    id="class-duration"
                    type="number"
                    min={1}
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                    disabled={disabledForm}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class-capacity">Capacity</Label>
                  <Input
                    id="class-capacity"
                    type="number"
                    min={1}
                    placeholder="Optional"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    disabled={disabledForm}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="class-location">Location</Label>
                <Input
                  id="class-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={disabledForm}
                />
              </div>

              <Separator />

              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Schedule
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="class-date">Date</Label>
                  <Input
                    id="class-date"
                    type="date"
                    value={scheduledOn}
                    onChange={(e) => setScheduledOn(e.target.value)}
                    disabled={disabledForm}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class-time">Time</Label>
                  <Input
                    id="class-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    disabled={disabledForm}
                  />
                </div>
              </div>

              <Separator />

              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fitness
              </p>
              <div className="space-y-2">
                <Label htmlFor="class-intensity">Intensity level</Label>
                <select
                  id="class-intensity"
                  className={selectClassName}
                  value={intensitySelectValue}
                  onChange={(e) => setIntensity(e.target.value)}
                  disabled={disabledForm}
                >
                  {INTENSITY_OPTIONS.map((opt) => (
                    <option key={`${opt.value}-${opt.label}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-focus">Targeted focus</Label>
                <Input
                  id="class-focus"
                  placeholder="e.g. core, mobility (comma-separated)"
                  value={targetedFocus}
                  onChange={(e) => setTargetedFocus(e.target.value)}
                  disabled={disabledForm}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="class-instructor-notes">Instructor notes</Label>
                <Textarea
                  id="class-instructor-notes"
                  value={instructorNotes}
                  onChange={(e) => setInstructorNotes(e.target.value)}
                  disabled={disabledForm}
                  rows={2}
                  className="min-h-[3rem] resize-y"
                />
              </div>

              <PrivacyToggle
                id="class-live-stream"
                title="Enable live video stream"
                description="Adds a Join live session control on this class card. End the session from the live dock when finished."
                checked={liveStreamEnabled}
                disabled={disabledForm}
                onCheckedChange={(checked) => {
                  setLiveStreamEnabled(checked);
                  if (checked) setAsyncWorkoutEnabled(false);
                }}
              />

              <PrivacyToggle
                id="class-async-workout"
                title="Enable asynchronous workout"
                description="Adds a shared workout queue for this class without live video. Members complete workouts on their own schedule."
                checked={asyncWorkoutEnabled}
                disabled={disabledForm}
                onCheckedChange={(checked) => {
                  setAsyncWorkoutEnabled(checked);
                  if (checked) setLiveStreamEnabled(false);
                }}
              />

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={disabledForm}>
                  {saving ? 'Saving…' : submitLabel}
                </Button>
              </div>
            </form>
            {(sessionFeatureTogglesOn || showClassWorkoutDeck) && (
              <div ref={classWorkoutDeckScrollRef} className="scroll-mt-6">
                {sessionFeatureTogglesOn && !showClassWorkoutDeck ? (
                  <p className="mt-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Save the class to open the workout queue and exercise editor.
                  </p>
                ) : null}
                {showClassWorkoutDeck && resolvedDeckSession ? (
                  <>
                    {console.log('[DEBUG] Resolved Session for Deck Builder', {
                      type: resolvedDeckSession.kind,
                      sessionId: resolvedDeckSession.sessionId,
                    })}
                    <ClassEditorLiveDeckBlock
                      workspaceId={workspaceId}
                      sessionId={resolvedDeckSession.sessionId}
                      hostUserId={resolvedDeckSession.hostUserId}
                      canWrite={canWrite}
                    />
                  </>
                ) : null}
              </div>
            )}
          </Fragment>
        )}
      </div>
    </div>
  );
}
