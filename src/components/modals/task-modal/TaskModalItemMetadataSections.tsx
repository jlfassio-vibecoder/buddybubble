'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Event details</p>
          <div className="space-y-2">
            <Label htmlFor="task-event-location">Location</Label>
            <Input
              id="task-event-location"
              value={eventLocation}
              onChange={(e) => onEventLocationChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Central Park"
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-event-url">Meeting link</Label>
            <Input
              id="task-event-url"
              type="url"
              value={eventUrl}
              onChange={(e) => onEventUrlChange(e.target.value)}
              disabled={!canWrite}
              placeholder="https://…"
              className="h-9"
            />
          </div>
        </div>
      )}

      {itemType === 'experience' && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Experience span</p>
          <div className="space-y-2">
            <Label htmlFor="task-experience-horizon">Season / label (optional)</Label>
            <Input
              id="task-experience-horizon"
              value={experienceSeason}
              onChange={(e) => onExperienceSeasonChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Summer 2026"
              className="h-9"
            />
          </div>
          <div className="flex flex-row flex-wrap gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="task-experience-start">Start date</Label>
              <input
                id="task-experience-start"
                type="date"
                value={scheduledOn}
                onChange={(e) => onExperienceStartDateChange(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="task-experience-end">End date</Label>
              <input
                id="task-experience-end"
                type="date"
                value={experienceEndDate}
                onChange={(e) => onExperienceEndDateChange(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Experiences appear as themed pills on their start date in the Month view.
          </p>
        </div>
      )}

      {itemType === 'memory' && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          <Label htmlFor="task-memory-caption">Caption / reflection</Label>
          <Textarea
            id="task-memory-caption"
            value={memoryCaption}
            onChange={(e) => onMemoryCaptionChange(e.target.value)}
            disabled={!canWrite}
            rows={3}
            placeholder="What made this moment special?"
          />
          <p className="text-xs text-muted-foreground">
            Photos and files go in Attachments below after you save.
          </p>
        </div>
      )}
    </>
  );
}
