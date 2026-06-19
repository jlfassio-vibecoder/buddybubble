import { WORKOUT_NARRATIVE_SECTION_LABEL_CLASS } from '@/lib/workout-factory/workout-viewer-narrative';

type WorkoutCoachBriefSectionProps = {
  brief: string;
};

/** Coach @conversation brief — matches `ViewReadHeader` in workout-viewer-dialog. */
export function WorkoutCoachBriefSection({ brief }: WorkoutCoachBriefSectionProps) {
  const trimmed = brief.trim();
  if (!trimmed) return null;

  return (
    <div className="space-y-1">
      <p className={WORKOUT_NARRATIVE_SECTION_LABEL_CLASS}>Coach brief</p>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {trimmed}
      </div>
    </div>
  );
}
