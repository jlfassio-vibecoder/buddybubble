'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EmomStationDraft } from '@/lib/workout-factory/types/emom-format-params';
import { cn } from '@/lib/utils';

const REST_SELECT_VALUE = '__rest__';

export type EmomStationBuilderProps = {
  stations: EmomStationDraft[];
  exerciseOptions: { index: number; label: string }[];
  totalMinutes: number;
  canWrite: boolean;
  hasRestInCycle: boolean;
  onStationsChange: (stations: EmomStationDraft[]) => void;
  className?: string;
};

function stationSelectValue(station: EmomStationDraft): string {
  if (station.is_rest) return REST_SELECT_VALUE;
  return String(station.exercise_index);
}

function stationFromSelectValue(value: string): Pick<EmomStationDraft, 'is_rest'> & {
  exercise_index?: number;
} {
  if (value === REST_SELECT_VALUE) return { is_rest: true };
  const idx = Math.max(0, Math.round(Number(value)));
  return { is_rest: false, exercise_index: Number.isFinite(idx) ? idx : 0 };
}

export function EmomStationBuilder({
  stations,
  exerciseOptions,
  totalMinutes,
  canWrite,
  hasRestInCycle,
  onStationsChange,
  className,
}: EmomStationBuilderProps) {
  const cycleLen = stations.length;

  const updateStation = (index: number, next: EmomStationDraft) => {
    onStationsChange(stations.map((s, i) => (i === index ? next : s)));
  };

  const removeStation = (index: number) => {
    if (stations.length <= 1) return;
    onStationsChange(stations.filter((_, i) => i !== index));
  };

  const addStation = () => {
    if (exerciseOptions.length === 0) {
      onStationsChange([...stations, { is_rest: true }]);
      return;
    }
    const defaultIndex = exerciseOptions[0]!.index;
    onStationsChange([
      ...stations,
      {
        is_rest: false,
        exercise_index: defaultIndex,
        target_type: 'reps',
        target_value: null,
      },
    ]);
  };

  return (
    <div className={cn('space-y-3 rounded-lg border border-border bg-muted/20 p-3', className)}>
      <div className="space-y-1">
        <Label className="text-sm font-medium">Station cycle</Label>
        <p className="text-xs text-muted-foreground">
          {cycleLen > 0
            ? `${cycleLen} station${cycleLen === 1 ? '' : 's'} repeat to fill ${totalMinutes} minutes.`
            : 'Add at least one station to define the cycle.'}
        </p>
        {hasRestInCycle ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Rest minutes are saved in this builder; live alternating highlights may not show rest
            until engine support is added.
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {stations.map((station, index) => {
          const selectValue = stationSelectValue(station);
          return (
            <li
              key={index}
              className="space-y-2 rounded-md border border-border/60 bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  #{index + 1}
                </span>
                <select
                  disabled={!canWrite}
                  value={selectValue}
                  onChange={(e) => {
                    const parsed = stationFromSelectValue(e.target.value);
                    if (parsed.is_rest) {
                      updateStation(index, { is_rest: true });
                      return;
                    }
                    const prev = station.is_rest
                      ? {
                          is_rest: false as const,
                          exercise_index: parsed.exercise_index ?? 0,
                          target_type: 'reps' as const,
                          target_value: null,
                        }
                      : station;
                    updateStation(index, {
                      ...prev,
                      is_rest: false,
                      exercise_index: parsed.exercise_index ?? 0,
                    });
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value={REST_SELECT_VALUE}>Rest</option>
                  {exerciseOptions.map((opt) => (
                    <option key={opt.index} value={String(opt.index)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {canWrite && stations.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStation(index)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove station ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {!station.is_rest ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex rounded-md border border-input p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={station.target_type === 'reps' ? 'default' : 'ghost'}
                      disabled={!canWrite}
                      className="h-7 px-2 text-xs"
                      onClick={() => updateStation(index, { ...station, target_type: 'reps' })}
                    >
                      Fixed reps
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={station.target_type === 'time' ? 'default' : 'ghost'}
                      disabled={!canWrite}
                      className="h-7 px-2 text-xs"
                      onClick={() => updateStation(index, { ...station, target_type: 'time' })}
                    >
                      Work time
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Target</Label>
                    <Input
                      type="number"
                      min={0}
                      disabled={!canWrite}
                      value={station.target_value ?? ''}
                      onChange={(e) => {
                        const t = e.target.value.trim();
                        const target_value = t === '' ? null : Math.max(0, Math.round(Number(t)));
                        updateStation(index, {
                          ...station,
                          target_value: Number.isFinite(target_value as number)
                            ? target_value
                            : null,
                        });
                      }}
                      placeholder={station.target_type === 'time' ? 'sec' : 'reps'}
                      className="h-8 w-20 text-xs"
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canWrite ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          aria-label="Add station to cycle"
          onClick={addStation}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add station
        </Button>
      ) : null}
    </div>
  );
}
