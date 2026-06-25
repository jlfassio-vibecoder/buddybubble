'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
import {
  INTERVAL_PRESET_CATALOG,
  INTERVAL_WORK_REST_RATIOS,
  applyIntervalPreset,
  deriveIntervalPresetFromParams,
  mergeTabataFormatParams,
  paramsMatchPreset,
  resolveRatioForTabataParams,
  type IntervalWorkRestRatio,
  type KnownIntervalPresetId,
} from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import {
  computeTabataBlockDurationFromParams,
  formatIntervalSecondsLabel,
  formatTabataBlockDurationPreview,
} from '@/lib/workout-factory/interval-timer/tabata-block-duration';
import { cn } from '@/lib/utils';

export type TabataFormatParamsEditorProps = {
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  disabled?: boolean;
};

function numInputValue(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

export function TabataFormatParamsEditor({
  params,
  onChange,
  disabled = false,
}: TabataFormatParamsEditorProps) {
  const [restLocked, setRestLocked] = useState(true);
  const [selectedRatio, setSelectedRatio] = useState<IntervalWorkRestRatio>(() =>
    resolveRatioForTabataParams(params),
  );

  const activePresetId = useMemo((): KnownIntervalPresetId | null => {
    for (const preset of INTERVAL_PRESET_CATALOG) {
      if (paramsMatchPreset(params, preset.id)) return preset.id;
    }
    return null;
  }, [params]);

  useEffect(() => {
    if (activePresetId != null) {
      setSelectedRatio(resolveRatioForTabataParams(params));
    }
  }, [activePresetId, params]);

  const workSeconds = typeof params.work_seconds === 'number' ? params.work_seconds : 0;
  const showWorkHint = workSeconds >= 120 || activePresetId === 'fighters';

  const subtitle = formatBlockSubtitle('tabata', params);
  const durationSec = computeTabataBlockDurationFromParams(params);
  const durationLabel = durationSec != null ? formatTabataBlockDurationPreview(durationSec) : null;

  const handlePresetSelect = (id: KnownIntervalPresetId) => {
    setRestLocked(true);
    setSelectedRatio(getIntervalPresetDefinitionRatio(id));
    onChange(applyIntervalPreset(id, { rounds: readRounds(params) }));
  };

  const handleRatioChange = (ratio: IntervalWorkRestRatio) => {
    setSelectedRatio(ratio);
    setRestLocked(true);
    onChange(mergeTabataFormatParams(params, {}, { restLocked: true, ratio }));
  };

  const handleWorkChange = (raw: string) => {
    const work_seconds = parseOptionalPositiveInt(raw);
    onChange(
      mergeTabataFormatParams(params, { work_seconds }, { restLocked, ratio: selectedRatio }),
    );
  };

  const handleRestChange = (raw: string) => {
    const rest_seconds = parseOptionalPositiveInt(raw);
    onChange(mergeTabataFormatParams(params, { rest_seconds }, { manualRestEdit: true }));
  };

  const handleRoundsChange = (raw: string) => {
    const rounds = parseOptionalPositiveInt(raw);
    onChange(mergeTabataFormatParams(params, { rounds }, { restLocked, ratio: selectedRatio }));
  };

  const handleRestLockToggle = (locked: boolean) => {
    setRestLocked(locked);
    if (locked) {
      onChange(mergeTabataFormatParams(params, {}, { restLocked: true, ratio: selectedRatio }));
    }
  };

  return (
    <div className="space-y-3" data-testid="tabata-format-params-editor">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Interval preset</p>
        <div className="flex flex-wrap gap-1.5">
          {INTERVAL_PRESET_CATALOG.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                disabled={disabled}
                className="h-7 px-2 text-[10px]"
                data-testid={`tabata-preset-${preset.id}`}
                onClick={() => handlePresetSelect(preset.id)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tabata-ratio" className="text-xs">
            Work:rest ratio
          </Label>
          <select
            id="tabata-ratio"
            disabled={disabled}
            value={selectedRatio}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            data-testid="tabata-ratio-select"
            onChange={(e) => handleRatioChange(e.target.value as IntervalWorkRestRatio)}
          >
            {INTERVAL_WORK_REST_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tabata-rounds" className="text-xs">
            Rounds *
          </Label>
          <Input
            id="tabata-rounds"
            type="number"
            disabled={disabled}
            value={numInputValue(params.rounds)}
            className="h-8 text-xs"
            data-testid="tabata-rounds-input"
            onChange={(e) => handleRoundsChange(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="tabata-work" className="text-xs">
            Work (sec)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="tabata-work"
              type="number"
              disabled={disabled}
              value={numInputValue(params.work_seconds)}
              className="h-8 text-xs"
              data-testid="tabata-work-input"
              onChange={(e) => handleWorkChange(e.target.value)}
            />
            {showWorkHint && workSeconds > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatIntervalSecondsLabel(workSeconds)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tabata-rest" className="text-xs">
            Rest (sec)
          </Label>
          <Input
            id="tabata-rest"
            type="number"
            disabled={disabled || restLocked}
            value={numInputValue(params.rest_seconds)}
            className={cn('h-8 text-xs', restLocked && 'opacity-70')}
            data-testid="tabata-rest-input"
            onChange={(e) => handleRestChange(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!restLocked}
          disabled={disabled}
          data-testid="tabata-rest-unlock"
          onChange={(e) => handleRestLockToggle(!e.target.checked)}
        />
        Edit rest manually
      </label>

      <div
        className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs"
        data-testid="tabata-params-preview"
      >
        {subtitle ? <p className="font-medium">{subtitle}</p> : null}
        {durationLabel ? <p className="text-muted-foreground">{durationLabel}</p> : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          Live sessions include 10s GET READY
        </p>
        {deriveIntervalPresetFromParams(params) === 'custom' ? (
          <p className="text-[10px] text-muted-foreground">Custom work/rest timing</p>
        ) : null}
      </div>
    </div>
  );
}

function readRounds(params: Record<string, unknown>): number | undefined {
  const rounds = params.rounds;
  return typeof rounds === 'number' && Number.isFinite(rounds) ? rounds : undefined;
}

function parseOptionalPositiveInt(raw: string): number | undefined {
  if (raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : undefined;
}

function getIntervalPresetDefinitionRatio(id: KnownIntervalPresetId): IntervalWorkRestRatio {
  return INTERVAL_PRESET_CATALOG.find((p) => p.id === id)?.ratioLabel ?? '2:1';
}
