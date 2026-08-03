import type { ItemType } from '@/lib/item-types';
import type { TaskMetadataFormFields } from '@/lib/item-metadata';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import type { TaskModalOriginalSnapshot } from '@/components/modals/task-modal/task-modal-save-utils';

/**
 * Provenance keys that differ between the live form and the last-saved snapshot.
 * Used to demote Coach stamps when the human overwrites a field.
 */
export function detectUserDemotedProvenanceKeys(args: {
  itemType: ItemType;
  fields: TaskMetadataFormFields;
  title: string;
  description: string;
  original: TaskModalOriginalSnapshot | null;
}): string[] {
  const { itemType, fields, title, description, original } = args;
  if (!original) return [];

  const keys: string[] = [];
  if (title.trim() !== original.title.trim()) keys.push('title');
  if (description.trim() !== (original.description ?? '').trim()) keys.push('description');

  let origMeta: Record<string, unknown> = {};
  try {
    origMeta = parseTaskMetadata(JSON.parse(original.metadataJson)) as Record<string, unknown>;
  } catch {
    origMeta = {};
  }
  const origFields = metadataFieldsFromParsed(origMeta);

  const changed = (a: string, b: string) => a.trim() !== b.trim();

  switch (itemType) {
    case 'event':
      if (changed(fields.eventLocation, origFields.eventLocation)) keys.push('location');
      if (changed(fields.eventUrl, origFields.eventUrl)) keys.push('url');
      if (JSON.stringify(fields.eventBring) !== JSON.stringify(origFields.eventBring)) {
        keys.push('bring');
      }
      if (changed(fields.eventGoing, origFields.eventGoing)) keys.push('going');
      if (changed(fields.eventCapacity, origFields.eventCapacity)) keys.push('capacity');
      if (JSON.stringify(fields.eventGoingPeople) !== JSON.stringify(origFields.eventGoingPeople)) {
        keys.push('going_people');
      }
      if (changed(fields.eventCost, origFields.eventCost)) keys.push('cost');
      if (changed(fields.eventEnds, origFields.eventEnds)) keys.push('ends');
      break;
    case 'experience':
      if (changed(fields.experienceSeason, origFields.experienceSeason)) keys.push('season');
      if (changed(fields.experienceEndDate, origFields.experienceEndDate)) keys.push('end_date');
      if (
        JSON.stringify(fields.experienceHighlights) !==
        JSON.stringify(origFields.experienceHighlights)
      ) {
        keys.push('highlights');
      }
      if (
        JSON.stringify(fields.experienceIncludes) !== JSON.stringify(origFields.experienceIncludes)
      ) {
        keys.push('includes');
      }
      if (
        JSON.stringify(fields.experienceGoodFor) !== JSON.stringify(origFields.experienceGoodFor)
      ) {
        keys.push('good_for');
      }
      if (changed(fields.experienceLocation, origFields.experienceLocation)) keys.push('location');
      if (changed(fields.experienceDurationMin, origFields.experienceDurationMin)) {
        keys.push('duration_min');
      }
      if (changed(fields.experiencePrice, origFields.experiencePrice)) keys.push('price');
      if (changed(fields.experienceGroupMin, origFields.experienceGroupMin)) keys.push('group_min');
      if (changed(fields.experienceGroupMax, origFields.experienceGroupMax)) keys.push('group_max');
      break;
    case 'idea':
      if (fields.ideaVotes !== origFields.ideaVotes) keys.push('votes');
      if (JSON.stringify(fields.ideaVotedBy) !== JSON.stringify(origFields.ideaVotedBy)) {
        keys.push('voted_by');
      }
      if (changed(fields.ideaEffort, origFields.ideaEffort)) keys.push('effort');
      if (changed(fields.ideaImpact, origFields.ideaImpact)) keys.push('impact');
      if (JSON.stringify(fields.ideaTags) !== JSON.stringify(origFields.ideaTags)) {
        keys.push('tags');
      }
      break;
    case 'memory':
      if (changed(fields.memoryCaption, origFields.memoryCaption)) keys.push('caption');
      if (JSON.stringify(fields.memoryPeople) !== JSON.stringify(origFields.memoryPeople)) {
        keys.push('people');
      }
      if (changed(fields.memoryLinkedEvent, origFields.memoryLinkedEvent)) {
        keys.push('linked_event');
      }
      if (changed(fields.memoryLocation, origFields.memoryLocation)) keys.push('location');
      if (JSON.stringify(fields.memoryReactions) !== JSON.stringify(origFields.memoryReactions)) {
        keys.push('reactions');
      }
      break;
    case 'workout':
    case 'workout_log':
      if (changed(fields.workoutType, origFields.workoutType)) keys.push('workout_type');
      if (changed(fields.workoutDurationMin, origFields.workoutDurationMin)) {
        keys.push('duration_min');
      }
      if (JSON.stringify(fields.workoutExercises) !== JSON.stringify(origFields.workoutExercises)) {
        keys.push('exercises');
        /** Flat form edits also clear structure chrome stamped on `blocks`. */
        keys.push('blocks');
      }
      if (itemType === 'workout' && changed(fields.workoutTargetRpe, origFields.workoutTargetRpe)) {
        keys.push('target_rpe');
      }
      if (itemType === 'workout_log') {
        if (changed(fields.workoutLogSessionRpe, origFields.workoutLogSessionRpe)) {
          keys.push('session_rpe');
        }
        if (changed(fields.workoutLogCompletion, origFields.workoutLogCompletion)) {
          keys.push('completion');
        }
        if (changed(fields.workoutLogMood, origFields.workoutLogMood)) keys.push('mood');
      }
      break;
    case 'program':
      if (changed(fields.programGoal, origFields.programGoal)) keys.push('goal');
      if (changed(fields.programDurationWeeks, origFields.programDurationWeeks)) {
        keys.push('duration_weeks');
      }
      if (changed(fields.programDaysPerWeek, origFields.programDaysPerWeek)) {
        keys.push('days_per_week');
      }
      if (changed(fields.programLevel, origFields.programLevel)) keys.push('level');
      if (fields.programCurrentWeek !== origFields.programCurrentWeek) keys.push('current_week');
      if (JSON.stringify(fields.programSchedule) !== JSON.stringify(origFields.programSchedule)) {
        keys.push('schedule');
      }
      if (changed(fields.programCapacity, origFields.programCapacity)) keys.push('capacity');
      if (changed(fields.programSourceTitle, origFields.programSourceTitle)) {
        keys.push('program_source_title');
      }
      break;
    default:
      break;
  }

  if (changed(fields.cardCoverPath, origFields.cardCoverPath)) keys.push('card_cover_path');

  return [...new Set(keys)];
}
