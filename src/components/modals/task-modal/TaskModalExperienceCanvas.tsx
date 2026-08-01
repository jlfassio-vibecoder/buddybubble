'use client';

import { CheckCircle2, MapPin, Sparkles, Star } from 'lucide-react';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import {
  TaskModalChipListEditor,
  TaskModalStringListEditor,
} from '@/components/modals/task-modal/TaskModalChipListEditor';

export type TaskModalExperienceCanvasProps = {
  canWrite: boolean;
  experienceHighlights: string[];
  onExperienceHighlightsChange: (value: string[]) => void;
  experienceIncludes: string[];
  onExperienceIncludesChange: (value: string[]) => void;
  experienceGoodFor: string[];
  onExperienceGoodForChange: (value: string[]) => void;
  experienceLocation: string;
  onExperienceLocationChange: (value: string) => void;
  experienceDurationMin: string;
  onExperienceDurationMinChange: (value: string) => void;
  experiencePrice: string;
  onExperiencePriceChange: (value: string) => void;
  experienceGroupMin: string;
  onExperienceGroupMinChange: (value: string) => void;
  experienceGroupMax: string;
  onExperienceGroupMaxChange: (value: string) => void;
  isAgentField?: (key: string) => boolean;
  className?: string;
};

/**
 * Handoff-aligned Experience Details canvas: highlights / includes / good_for + logistics.
 * Season / start / end stay in Experience span (ItemMetadataSections). No booking / maps.
 */
export function TaskModalExperienceCanvas({
  canWrite,
  experienceHighlights,
  onExperienceHighlightsChange,
  experienceIncludes,
  onExperienceIncludesChange,
  experienceGoodFor,
  onExperienceGoodForChange,
  experienceLocation,
  onExperienceLocationChange,
  experienceDurationMin,
  onExperienceDurationMinChange,
  experiencePrice,
  onExperiencePriceChange,
  experienceGroupMin,
  onExperienceGroupMinChange,
  experienceGroupMax,
  onExperienceGroupMaxChange,
  isAgentField,
  className,
}: TaskModalExperienceCanvasProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));

  return (
    <div className={className} data-testid="task-modal-experience-canvas">
      <TaskModalSection
        icon={<Sparkles className="size-4" aria-hidden />}
        title="Experience"
        sub="A public, shareable offering — highlights and logistics for the card body."
      >
        <TaskModalField label="Highlights" agent={agent('highlights')} className="mb-0">
          <TaskModalStringListEditor
            values={experienceHighlights}
            onChange={onExperienceHighlightsChange}
            canWrite={canWrite}
            addPlaceholder="Add highlight…"
            testId="task-modal-experience-highlights"
            emptyHelp="Add a few standout moments so people know what this experience is about."
            icon={<Star className="size-3.5" aria-hidden />}
          />
        </TaskModalField>

        <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <TaskModalField
            label="Duration (min)"
            optional
            agent={agent('duration_min')}
            className="mb-0"
          >
            <input
              type="number"
              min={1}
              value={experienceDurationMin}
              onChange={(e) => onExperienceDurationMinChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. 150"
              aria-label="Duration in minutes"
              className={taskModalInputClass}
              data-testid="task-modal-experience-duration"
            />
          </TaskModalField>
          <TaskModalField label="Group min" optional agent={agent('group_min')} className="mb-0">
            <input
              type="number"
              min={1}
              value={experienceGroupMin}
              onChange={(e) => onExperienceGroupMinChange(e.target.value)}
              disabled={!canWrite}
              placeholder="Min"
              aria-label="Group size minimum"
              className={taskModalInputClass}
              data-testid="task-modal-experience-group-min"
            />
          </TaskModalField>
          <TaskModalField label="Group max" optional agent={agent('group_max')} className="mb-0">
            <input
              type="number"
              min={1}
              value={experienceGroupMax}
              onChange={(e) => onExperienceGroupMaxChange(e.target.value)}
              disabled={!canWrite}
              placeholder="Max"
              aria-label="Group size maximum"
              className={taskModalInputClass}
              data-testid="task-modal-experience-group-max"
            />
          </TaskModalField>
        </div>

        <TaskModalField label="Price" optional agent={agent('price')} className="mb-0 mt-3.5">
          <input
            value={experiencePrice}
            onChange={(e) => onExperiencePriceChange(e.target.value)}
            disabled={!canWrite}
            placeholder="e.g. $28 · members $20"
            aria-label="Price"
            className={taskModalInputClass}
            data-testid="task-modal-experience-price"
          />
        </TaskModalField>

        <TaskModalField label="Location" optional agent={agent('location')} className="mb-0 mt-3.5">
          <div className="relative">
            <MapPin
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={experienceLocation}
              onChange={(e) => onExperienceLocationChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Eagle Ridge Trailhead"
              aria-label="Location"
              className={`${taskModalInputClass} pl-9`}
              data-testid="task-modal-experience-location"
            />
          </div>
        </TaskModalField>
      </TaskModalSection>

      <TaskModalSection
        icon={<CheckCircle2 className="size-4" aria-hidden />}
        title="What's included"
        sub="What’s covered and who this is a good fit for."
      >
        <TaskModalField label="Includes" agent={agent('includes')} className="mb-0">
          <TaskModalStringListEditor
            values={experienceIncludes}
            onChange={onExperienceIncludesChange}
            canWrite={canWrite}
            addPlaceholder="Add item…"
            testId="task-modal-experience-includes"
            emptyHelp="List what’s included (guide, gear, snack…)."
            icon={<CheckCircle2 className="size-3.5" aria-hidden />}
          />
        </TaskModalField>

        <TaskModalField label="Good for" agent={agent('good_for')} className="mb-0 mt-3.5">
          <TaskModalChipListEditor
            values={experienceGoodFor}
            onChange={onExperienceGoodForChange}
            canWrite={canWrite}
            addPlaceholder="Add tag…"
            testId="task-modal-experience-good-for"
          />
        </TaskModalField>
      </TaskModalSection>
    </div>
  );
}
