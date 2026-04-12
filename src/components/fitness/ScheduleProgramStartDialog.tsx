'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scheduledTimeToInputValue } from '@/lib/task-scheduled-time';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

type TaskLike = {
  id: string;
  title: string;
  scheduled_on?: string | null;
  scheduled_time?: string | null;
};

export type ScheduleProgramStartDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskLike | null;
  calendarTimezone: string | null | undefined;
  saving: boolean;
  onSave: (params: { scheduledOnYmd: string | null; timeHm: string | null }) => Promise<void>;
};

export function ScheduleProgramStartDialog({
  open,
  onOpenChange,
  task,
  calendarTimezone,
  saving,
  onSave,
}: ScheduleProgramStartDialogProps) {
  const tz = calendarTimezone?.trim() || 'UTC';
  const [dateYmd, setDateYmd] = useState('');
  const [timeHm, setTimeHm] = useState('');

  useEffect(() => {
    if (!open || !task) return;
    const raw = task.scheduled_on;
    if (raw != null && String(raw).trim() !== '') {
      setDateYmd(String(raw).slice(0, 10));
    } else {
      setDateYmd(getCalendarDateInTimeZone(tz));
    }
    setTimeHm(scheduledTimeToInputValue(task.scheduled_time));
  }, [open, task, tz]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ymd = dateYmd.trim().slice(0, 10);
    const validYmd = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
    await onSave({
      scheduledOnYmd: validYmd,
      timeHm: timeHm.trim() ? timeHm.trim().slice(0, 5) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Schedule program start</DialogTitle>
            <DialogDescription>
              {task ? (
                <>
                  Set when <span className="font-medium text-foreground">{task.title}</span> starts.
                  It stays in Active Programs until you begin week 1.
                </>
              ) : (
                'Pick a start date to sync with your calendar.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="program-start-date">Start date</Label>
              <Input
                id="program-start-date"
                type="date"
                value={dateYmd}
                onChange={(e) => setDateYmd(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="program-start-time">Start time (optional)</Label>
              <Input
                id="program-start-time"
                type="time"
                value={timeHm}
                onChange={(e) => setTimeHm(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Leave time empty for an all-day calendar entry.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !dateYmd.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
