'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dumbbell, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createClient } from '@utils/supabase/client';
import type { Json, UnitSystem } from '@/types/database';

type BiometricsRecord = {
  weight?: number;
  height?: number;
  weight_kg?: number;
  height_cm?: number;
  age?: number;
};

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Strip keys we persist from controlled fields so extras merge does not resurrect stale values. */
const MANAGED_BIOMETRIC_KEYS = ['weight', 'height', 'weight_kg', 'height_cm', 'age'] as const;

function decodeWeightDisplay(bio: BiometricsRecord, unitSystem: UnitSystem): string {
  const wkg =
    typeof bio.weight_kg === 'number' && Number.isFinite(bio.weight_kg) && bio.weight_kg > 0
      ? bio.weight_kg
      : null;
  if (wkg != null) {
    return unitSystem === 'imperial' ? String(round1(wkg * LB_PER_KG)) : String(round1(wkg));
  }
  if (typeof bio.weight === 'number' && Number.isFinite(bio.weight) && bio.weight > 0) {
    return String(bio.weight);
  }
  return '';
}

/**
 * Canonical height is `height_cm`. Legacy `height` was ambiguous (cm vs in); storefront briefly
 * wrote centimeters into `height` while the UI labeled it as inches.
 */
function decodeHeightDisplay(bio: BiometricsRecord, unitSystem: UnitSystem): string {
  const hcm =
    typeof bio.height_cm === 'number' && Number.isFinite(bio.height_cm) && bio.height_cm > 0
      ? bio.height_cm
      : null;
  if (hcm != null) {
    return unitSystem === 'imperial' ? String(round1(hcm / CM_PER_IN)) : String(round1(hcm));
  }
  if (typeof bio.height === 'number' && Number.isFinite(bio.height) && bio.height > 0) {
    if (unitSystem === 'metric') {
      return String(round1(bio.height));
    }
    const h = bio.height;
    const hasKg =
      typeof bio.weight_kg === 'number' && Number.isFinite(bio.weight_kg) && bio.weight_kg > 0;
    if (h > 100 && hasKg) {
      return String(round1(h / CM_PER_IN));
    }
    if (h >= 130) {
      return String(round1(h / CM_PER_IN));
    }
    return String(round1(h));
  }
  return '';
}

type LocalProfile = {
  id: string | null;
  goals: string[];
  equipment: string[];
  unitSystem: UnitSystem;
  weight: string;
  height: string;
  age: string;
};

const EMPTY_PROFILE: LocalProfile = {
  id: null,
  goals: [],
  equipment: [],
  unitSystem: 'metric',
  weight: '',
  height: '',
  age: '',
};

const EQUIPMENT_OPTIONS = [
  'Barbells',
  'Dumbbells',
  'Kettlebells',
  'Pull-up bar',
  'Resistance bands',
  'Treadmill',
  'Stationary bike',
  'Rowing machine',
  'Cable machine',
  'Smith machine',
  'Yoga mat',
  'No equipment',
];

export type FitnessProfileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Current board bubble (not “All”); required to attach a generated workout card. */
  bubbleIdForTasks?: string | null;
  /** Bump Kanban / task views after a workout card is inserted. */
  onQuickWorkoutCreated?: () => void;
};

export function FitnessProfileSheet({
  open,
  onOpenChange,
  workspaceId,
  bubbleIdForTasks = null,
  onQuickWorkoutCreated,
}: FitnessProfileSheetProps) {
  const [profile, setProfile] = useState<LocalProfile>(EMPTY_PROFILE);
  /** Other `biometrics` keys (sex, experience, …) merged on save — not edited in this sheet. */
  const [bioExtras, setBioExtras] = useState<Record<string, unknown>>({});
  const [newGoal, setNewGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickWorkoutBusy, setQuickWorkoutBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('fitness_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const bio = (data.biometrics as BiometricsRecord) ?? {};
      const unitSystem = (data.unit_system as UnitSystem) ?? 'metric';
      const extras: Record<string, unknown> = { ...(data.biometrics as Record<string, unknown>) };
      for (const k of MANAGED_BIOMETRIC_KEYS) {
        delete extras[k];
      }
      setBioExtras(extras);
      setProfile({
        id: data.id as string,
        goals: (data.goals as string[]) ?? [],
        equipment: (data.equipment as string[]) ?? [],
        unitSystem,
        weight: decodeWeightDisplay(bio, unitSystem),
        height: decodeHeightDisplay(bio, unitSystem),
        age: bio.age != null ? String(bio.age) : '',
      });
    } else {
      setBioExtras({});
      setProfile(EMPTY_PROFILE);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void loadProfile();
  }, [open, loadProfile]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const w = parseFloat(profile.weight);
    const h = parseFloat(profile.height);
    const a = parseInt(profile.age, 10);

    const biometrics: Record<string, unknown> = { ...bioExtras };
    if (!isNaN(w) && w > 0) {
      biometrics.weight_kg = profile.unitSystem === 'imperial' ? w / LB_PER_KG : w;
    } else {
      delete biometrics.weight_kg;
    }
    if (!isNaN(h) && h > 0) {
      biometrics.height_cm = profile.unitSystem === 'imperial' ? h * CM_PER_IN : h;
    } else {
      delete biometrics.height_cm;
    }
    if (!isNaN(a) && a > 0) {
      biometrics.age = a;
    } else {
      delete biometrics.age;
    }
    delete biometrics.weight;
    delete biometrics.height;

    const payload = {
      workspace_id: workspaceId,
      user_id: user.id,
      goals: profile.goals,
      equipment: profile.equipment,
      unit_system: profile.unitSystem,
      biometrics: biometrics as Json,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = profile.id
      ? await supabase.from('fitness_profiles').update(payload).eq('id', profile.id)
      : await supabase.from('fitness_profiles').insert(payload);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
  };

  const handleQuickWorkout = async () => {
    if (!bubbleIdForTasks?.trim()) {
      toast.error('Select a bubble on the board (not “All”) before generating a workout.');
      return;
    }
    setQuickWorkoutBusy(true);
    try {
      const res = await fetch('/api/ai/quick-workout-from-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          bubble_id: bubbleIdForTasks.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string };
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not generate workout.');
        return;
      }
      toast.success(
        typeof data.title === 'string' && data.title.trim()
          ? `Added workout: ${data.title.trim()}`
          : 'Workout card added to this bubble.',
      );
      onQuickWorkoutCreated?.();
    } catch {
      toast.error('Network error. Try again.');
    } finally {
      setQuickWorkoutBusy(false);
    }
  };

  const addGoal = () => {
    const t = newGoal.trim();
    if (!t || profile.goals.includes(t)) return;
    setProfile((p) => ({ ...p, goals: [...p.goals, t] }));
    setNewGoal('');
  };

  const removeGoal = (g: string) => {
    setProfile((p) => ({ ...p, goals: p.goals.filter((x) => x !== g) }));
  };

  const toggleEquipment = (item: string) => {
    setProfile((p) => ({
      ...p,
      equipment: p.equipment.includes(item)
        ? p.equipment.filter((x) => x !== item)
        : [...p.equipment, item],
    }));
  };

  const weightLabel = profile.unitSystem === 'metric' ? 'Weight (kg)' : 'Weight (lbs)';
  const heightLabel = profile.unitSystem === 'metric' ? 'Height (cm)' : 'Height (in)';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0">
        <header className="flex items-center gap-3 border-b border-border px-6 pb-3 pr-14 pt-4">
          <Dumbbell className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <SheetTitle className="text-base font-semibold">Fitness Profile</SheetTitle>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {error && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            {/* Unit system */}
            <div className="space-y-2">
              <Label>Unit System</Label>
              <div className="flex gap-2">
                {(['metric', 'imperial'] as UnitSystem[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setProfile((p) => ({ ...p, unitSystem: u }))}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      profile.unitSystem === u
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-foreground hover:bg-muted/50',
                    )}
                  >
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Biometrics */}
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Biometrics{' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fp-weight" className="text-xs">
                    {weightLabel}
                  </Label>
                  <Input
                    id="fp-weight"
                    type="number"
                    min={0}
                    step="0.1"
                    value={profile.weight}
                    onChange={(e) => setProfile((p) => ({ ...p, weight: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fp-height" className="text-xs">
                    {heightLabel}
                  </Label>
                  <Input
                    id="fp-height"
                    type="number"
                    min={0}
                    step="0.1"
                    value={profile.height}
                    onChange={(e) => setProfile((p) => ({ ...p, height: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fp-age" className="text-xs">
                    Age
                  </Label>
                  <Input
                    id="fp-age"
                    type="number"
                    min={0}
                    max={120}
                    value={profile.age}
                    onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Goals */}
            <div className="space-y-3">
              <Label>Goals</Label>
              <div className="flex gap-2">
                <Input
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGoal();
                    }
                  }}
                  placeholder="e.g. Run 5k in under 25 min"
                  className="h-9"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={addGoal}
                  disabled={!newGoal.trim()}
                  className="h-9 w-9 shrink-0"
                  aria-label="Add goal"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {profile.goals.length > 0 && (
                <ul className="space-y-1.5">
                  {profile.goals.map((g) => (
                    <li
                      key={g}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1">{g}</span>
                      <button
                        type="button"
                        onClick={() => removeGoal(g)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove goal: ${g}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Equipment */}
            <div className="space-y-3">
              <Label>Available Equipment</Label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleEquipment(item)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      profile.equipment.includes(item)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick workout (same single-call Vertex path as storefront preview / trial job) */}
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="text-sm font-medium">Quick workout</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate one session card from this profile on the bubble you have open on the
                board—no multi-step card builder.
              </p>
              {!bubbleIdForTasks?.trim() ? (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Open a specific bubble on the Kanban board (not “All”) to enable this.
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={quickWorkoutBusy || loading || saving || !bubbleIdForTasks?.trim()}
                onClick={() => void handleQuickWorkout()}
              >
                {quickWorkoutBusy ? 'Generating…' : 'Generate workout on current bubble'}
              </Button>
            </div>
          </div>
        )}

        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
