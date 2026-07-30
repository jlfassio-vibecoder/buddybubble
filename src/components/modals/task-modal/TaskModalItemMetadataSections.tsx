'use client';

import { CalendarDays, Camera, MapPin } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import type { ItemType } from '@/types/database';

export type TaskModalItemMetadataSectionsProps = {
  itemType: ItemType;
  canWrite: boolean;
  eventLocation: string;
  onEventLocationChange: (value: string) => void;
  eventUrl: string;
  onEventUrlChange: (value: string) => void;
  experienceSeason: string;
  onExperienceSeasonChange: (value: string) => void;
  scheduledOn: string;
  onExperienceStartDateChange: (value: string) => void;
  experienceEndDate: string;
  onExperienceEndDateChange: (value: string) => void;
  memoryCaption: string;
  onMemoryCaptionChange: (value: string) => void;
};

export function TaskModalItemMetadataSections({
  itemType,
  canWrite,
  eventLocation,
  onEventLocationChange,
  eventUrl,
  onEventUrlChange,
  experienceSeason,
  onExperienceSeasonChange,
  scheduledOn,
  onExperienceStartDateChange,
  experienceEndDate,
  onExperienceEndDateChange,
  memoryCaption,
  onMemoryCaptionChange,
}: TaskModalItemMetadataSectionsProps) {
  return (
    <>
      {itemType === 'event' && (
        <TaskModalSection icon={<MapPin className="size-4" aria-hidden />} title="Event details">
          <TaskModalField label="Location">
            <input
              value={eventLocation}
              onChange={(e) => onEventLocationChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Central Park"
              className={taskModalInputClass}
            />
          </TaskModalField>
          <TaskModalField label="Meeting link">
            <input
              type="url"
              value={eventUrl}
              onChange={(e) => onEventUrlChange(e.target.value)}
              disabled={!canWrite}
              placeholder="https://…"
              className={taskModalInputClass}
            />
          </TaskModalField>
        </TaskModalSection>
      )}

      {itemType === 'experience' && (
        <TaskModalSection
          icon={<CalendarDays className="size-4" aria-hidden />}
          title="Experience span"
        >
          <TaskModalField label="Season / label" optional>
            <input
              value={experienceSeason}
              onChange={(e) => onExperienceSeasonChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Summer 2026"
              className={taskModalInputClass}
            />
          </TaskModalField>
          <TaskModalField help="Experiences appear as themed pills on their start date in the Month view.">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <input
                type="date"
                aria-label="Start date"
                value={scheduledOn}
                onChange={(e) => onExperienceStartDateChange(e.target.value)}
                disabled={!canWrite}
                className={taskModalInputClass}
              />
              <input
                type="date"
                aria-label="End date"
                value={experienceEndDate}
                onChange={(e) => onExperienceEndDateChange(e.target.value)}
                disabled={!canWrite}
                className={taskModalInputClass}
              />
            </div>
          </TaskModalField>
        </TaskModalSection>
      )}

      {itemType === 'memory' && (
        <TaskModalSection icon={<Camera className="size-4" aria-hidden />} title="Moment">
          <TaskModalField
            label="Caption / reflection"
            help="Photos and files go in Attachments below after you save."
          >
            <Textarea
              value={memoryCaption}
              onChange={(e) => onMemoryCaptionChange(e.target.value)}
              disabled={!canWrite}
              rows={3}
              placeholder="What made this moment special?"
            />
          </TaskModalField>
        </TaskModalSection>
      )}
    </>
  );
}
