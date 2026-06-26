'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { BlockBlueprintCatalogEntry } from '@/lib/agents/coach/block-blueprint-catalog';
import {
  BLOCK_BLUEPRINT_CATALOG,
  groupCatalogForDisplay,
  searchBlockCatalog,
} from '@/lib/agents/coach/block-blueprint-catalog';
import {
  blockFormatLabel,
  blockShapeDropMessage,
  canAddExerciseToBlock,
  canRemoveExerciseFromBlock,
  formatParamFieldMeta,
  outlineBlockSummary,
} from '@/lib/agents/coach/outline-editor-client';
import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import type { BlockShapeDrop } from '@/lib/agents/coach/parse';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { TabataFormatParamsEditor } from '@/components/fitness/TabataFormatParamsEditor';

export type WorkoutOutlinePanelProps = {
  editor: WorkoutOutlineEditorState;
  canWrite: boolean;
};

function OutlineValidationBanner({ drops }: { drops: BlockShapeDrop[] }) {
  if (drops.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
      <p className="font-medium">Validation notes</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        {drops.slice(0, 6).map((d, i) => (
          <li key={`${d.field}-${d.reason}-${i}`}>{blockShapeDropMessage(d)}</li>
        ))}
      </ul>
    </div>
  );
}

function OutlineFormatParamsForm({
  block,
  onChange,
  disabled,
}: {
  block: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const format = typeof block.block_format === 'string' ? block.block_format : null;
  if (!format) return null;
  const fields = formatParamFieldMeta(format as BlockFormat);
  const params =
    block.format_params &&
    typeof block.format_params === 'object' &&
    !Array.isArray(block.format_params)
      ? (block.format_params as Record<string, unknown>)
      : {};

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `outline-param-${field.key}`;
        if (field.type === 'boolean') {
          const checked = Boolean(params[field.key]);
          return (
            <label key={field.key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                id={id}
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange({ ...params, [field.key]: e.target.checked })}
              />
              {field.label}
            </label>
          );
        }
        if (field.type === 'select' && field.options) {
          const value = typeof params[field.key] === 'string' ? String(params[field.key]) : '';
          return (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={id} className="text-xs">
                {field.label}
              </Label>
              <select
                id={id}
                disabled={disabled}
                value={value}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                onChange={(e) => onChange({ ...params, [field.key]: e.target.value })}
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (field.type === 'string') {
          const value = typeof params[field.key] === 'string' ? params[field.key] : '';
          return (
            <div key={field.key} className="space-y-1 sm:col-span-2">
              <Label htmlFor={id} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={id}
                disabled={disabled}
                value={String(value ?? '')}
                className="h-8 text-xs"
                onChange={(e) => onChange({ ...params, [field.key]: e.target.value })}
              />
            </div>
          );
        }
        const numVal = typeof params[field.key] === 'number' ? params[field.key] : '';
        return (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={id} className="text-xs">
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
            <Input
              id={id}
              type="number"
              disabled={disabled}
              value={numVal === '' ? '' : String(numVal)}
              className="h-8 text-xs"
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...params,
                  [field.key]: v === '' ? undefined : Number(v),
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function OutlineBlockCard({
  block,
  index,
  total,
  expanded,
  canWrite,
  disabled,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: Record<string, unknown>;
  index: number;
  total: number;
  expanded: boolean;
  canWrite: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isInstruction =
    Array.isArray(block.instructions) && block.instructions.length > 0 && !block.block_format;
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  const formatLabel = isInstruction
    ? 'Instruction'
    : blockFormatLabel(typeof block.block_format === 'string' ? block.block_format : null);

  return (
    <div className="rounded-md border border-border/70 bg-background/80">
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggle}
          disabled={disabled}
        >
          <p className="truncate text-sm font-medium">{outlineBlockSummary(block)}</p>
          <p className="text-[11px] text-muted-foreground">{formatLabel}</p>
        </button>
        {canWrite && !disabled && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onMoveDown}
              disabled={index >= total - 1}
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          <div className="space-y-1">
            <Label className="text-xs">Block name</Label>
            <Input
              disabled={disabled || !canWrite}
              value={typeof block.name === 'string' ? block.name : ''}
              className="h-8 text-sm"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          {isInstruction ? (
            <div className="space-y-1">
              <Label className="text-xs">Instructions (one per line)</Label>
              <p className="text-[11px] text-muted-foreground">
                Use Warm-up, Cool-down, Finisher, or Mobility in the block name so this section
                routes correctly.
              </p>
              <Textarea
                disabled={disabled || !canWrite}
                rows={3}
                className="text-xs"
                value={
                  Array.isArray(block.instructions)
                    ? block.instructions
                        .filter((x): x is string => typeof x === 'string')
                        .join('\n')
                    : ''
                }
                onChange={(e) =>
                  onChange({
                    instructions: e.target.value
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          ) : (
            <>
              {typeof block.block_format === 'string' && block.block_format === 'tabata' ? (
                <TabataFormatParamsEditor
                  params={
                    block.format_params &&
                    typeof block.format_params === 'object' &&
                    !Array.isArray(block.format_params)
                      ? (block.format_params as Record<string, unknown>)
                      : {}
                  }
                  exerciseCount={exercises.length}
                  disabled={disabled || !canWrite}
                  onChange={(format_params) => onChange({ format_params })}
                />
              ) : (
                <OutlineFormatParamsForm
                  block={block}
                  disabled={disabled || !canWrite}
                  onChange={(format_params) => onChange({ format_params })}
                />
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Exercise placeholders</p>
                {exercises.map((ex, exIdx) => {
                  const name =
                    ex &&
                    typeof ex === 'object' &&
                    !Array.isArray(ex) &&
                    typeof (ex as { name?: unknown }).name === 'string'
                      ? (ex as { name: string }).name
                      : '';
                  return (
                    <Input
                      key={exIdx}
                      disabled={disabled || !canWrite}
                      className="h-8 text-xs"
                      placeholder={`Exercise ${exIdx + 1}`}
                      value={name}
                      onChange={(e) => {
                        const next = exercises.map((item, i) => {
                          if (i !== exIdx) return item;
                          return {
                            ...(typeof item === 'object' && item ? item : {}),
                            name: e.target.value,
                          };
                        });
                        onChange({ exercises: next });
                      }}
                    />
                  );
                })}
                {canWrite && !disabled && canAddExerciseToBlock(block) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      onChange({
                        exercises: [...exercises, { name: `Movement ${exercises.length + 1}` }],
                      })
                    }
                  >
                    Add exercise
                  </Button>
                )}
                {canWrite &&
                  !disabled &&
                  canRemoveExerciseFromBlock(block) &&
                  exercises.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => onChange({ exercises: exercises.slice(0, -1) })}
                    >
                      Remove last exercise
                    </Button>
                  )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OutlineCatalogPicker({
  onPick,
  disabled,
}: {
  onPick: (preset: BlockBlueprintCatalogEntry) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => searchBlockCatalog(query, BLOCK_BLUEPRINT_CATALOG), [query]);
  const items = useMemo(
    () => groupCatalogForDisplay(filtered, { grouped: query.trim() === '' }),
    [filtered, query],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Plus className="mr-1 size-3.5" />
          Add from catalog
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Block catalog</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search blocks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9"
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pt-2">
          {items.map((item, i) => {
            if (item.type === 'header') {
              return (
                <p
                  key={`h-${item.group}-${i}`}
                  className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {item.title}
                </p>
              );
            }
            return (
              <button
                key={item.entry.id}
                type="button"
                className="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onPick(item.entry);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="text-sm font-medium">{item.entry.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.entry.token.trim()}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkoutOutlinePanel({ editor, canWrite }: WorkoutOutlinePanelProps) {
  const {
    draftBlocks,
    outlineUiState,
    validationDrops,
    isOutlineConfirmed,
    localError,
    isGenerating,
    expandedBlockIdx,
    setExpandedBlockIdx,
    addFromCatalog,
    addInstructionBlock,
    updateBlock,
    removeBlock,
    reorderBlocks,
    saveDraft,
    confirmStructure,
    editStructure,
    retryStructure,
    hasFactory,
  } = editor;

  const disabled = !canWrite || isGenerating || hasFactory;
  const showEditor = !isOutlineConfirmed && outlineUiState !== 'read_only';

  return (
    <div
      className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3"
      data-testid="workout-outline-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Workout structure</p>
        </div>
        {isOutlineConfirmed && (
          <span className="text-[11px] font-medium text-primary">Confirmed</span>
        )}
      </div>

      {hasFactory && (
        <p className="text-xs text-muted-foreground">
          A generated workout exists on this card. Clear or regenerate the workout to edit
          structure.
        </p>
      )}

      {localError && outlineUiState !== 'confirmed' && (
        <p className="text-xs text-destructive">{localError}</p>
      )}

      {isOutlineConfirmed && (
        <div className="space-y-2">
          {draftBlocks.map((block, i) => (
            <p key={i} className="text-xs text-foreground">
              {outlineBlockSummary(block)}
            </p>
          ))}
          {canWrite && !hasFactory && (
            <Button type="button" variant="outline" size="sm" onClick={() => void editStructure()}>
              Edit structure
            </Button>
          )}
        </div>
      )}

      {showEditor && (
        <>
          {outlineUiState === 'empty' && (
            <p className="text-xs text-muted-foreground">
              Add parametric blocks from the catalog or generate structure with AI before intake and
              Generate Workout.
            </p>
          )}

          {outlineUiState === 'generating' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Generating workout structure…
            </div>
          )}

          {(outlineUiState === 'ready' ||
            outlineUiState === 'needs_structure' ||
            outlineUiState === 'failed' ||
            outlineUiState === 'empty') &&
            !isGenerating && (
              <>
                <OutlineValidationBanner drops={validationDrops} />
                <div className="space-y-2">
                  {draftBlocks.map((block, index) => (
                    <OutlineBlockCard
                      key={index}
                      block={block}
                      index={index}
                      total={draftBlocks.length}
                      expanded={expandedBlockIdx === index}
                      canWrite={canWrite}
                      disabled={disabled}
                      onToggle={() =>
                        setExpandedBlockIdx((prev) => (prev === index ? null : index))
                      }
                      onChange={(patch) => updateBlock(index, patch)}
                      onRemove={() => removeBlock(index)}
                      onMoveUp={() => reorderBlocks(index, index - 1)}
                      onMoveDown={() => reorderBlocks(index, index + 1)}
                    />
                  ))}
                </div>
              </>
            )}

          {canWrite && !hasFactory && (
            <div className="flex flex-wrap gap-2">
              <OutlineCatalogPicker
                disabled={disabled}
                onPick={(preset) => {
                  void addFromCatalog(preset);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  void addInstructionBlock('Warm-up', ['Dynamic prep']);
                }}
              >
                Add instruction block
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isGenerating}
                onClick={() => void retryStructure()}
              >
                {isGenerating ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 size-3.5" />
                )}
                {outlineUiState === 'needs_structure' || outlineUiState === 'failed'
                  ? 'Retry structure'
                  : 'Generate structure with AI'}
              </Button>
            </div>
          )}

          {canWrite && draftBlocks.length > 0 && !hasFactory && !isGenerating && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => void saveDraft()}
              >
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                className={cn(!isOutlineConfirmed && 'bg-primary')}
                onClick={() => void confirmStructure()}
              >
                Confirm structure
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
