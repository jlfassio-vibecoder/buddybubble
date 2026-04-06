'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatUserFacingError } from '@/lib/format-error';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { COMMON_CALENDAR_TIMEZONES } from '@/lib/calendar-timezones';

export { COMMON_CALENDAR_TIMEZONES };

export type WorkspaceSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSaved?: () => void;
  /** When true, show link to pending join requests (waiting room). */
  isAdmin?: boolean;
};

export function WorkspaceSettingsModal({
  open,
  onOpenChange,
  workspaceId,
  onSaved,
  isAdmin = false,
}: WorkspaceSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [initialTz, setInitialTz] = useState('UTC');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();
    setLoading(false);
    if (qErr || !data) {
      setError(qErr?.message ?? 'Could not load workspace');
      return;
    }
    const row = data as { calendar_timezone?: string | null };
    const tz = row.calendar_timezone?.trim() || 'UTC';
    setTimezone(tz);
    setInitialTz(tz);
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const dirty = timezone !== initialTz;

  const save = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: uErr } = await supabase
      .from('workspaces')
      .update({ calendar_timezone: timezone })
      .eq('id', workspaceId);
    setSaving(false);
    if (uErr) {
      if (isMissingColumnSchemaCacheError(uErr, 'calendar_timezone')) {
        setError(
          'Calendar timezone is not available on this database yet. Apply the scheduled-dates migration in Supabase, then try again.',
        );
      } else {
        setError(formatUserFacingError(uErr));
      }
      return;
    }
    setInitialTz(timezone);
    onSaved?.();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Workspace settings</h2>
            <p className="text-xs text-slate-500">Calendar timezone for tasks and automation.</p>
            {isAdmin ? (
              <p className="mt-2 text-xs">
                <Link
                  href={`/app/${workspaceId}/invites?tab=pending`}
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  onClick={() => onOpenChange(false)}
                >
                  Pending join requests
                </Link>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="ws-cal-tz">Calendar timezone</Label>
              <select
                id="ws-cal-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                {!COMMON_CALENDAR_TIMEZONES.includes(
                  timezone as (typeof COMMON_CALENDAR_TIMEZONES)[number],
                ) && <option value={timezone}>{timezone} (current)</option>}
                {COMMON_CALENDAR_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Changing this affects when tasks move to the Today column and how due dates compare
                to &ldquo;today&rdquo; for this workspace.
              </p>
            </div>
            <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
