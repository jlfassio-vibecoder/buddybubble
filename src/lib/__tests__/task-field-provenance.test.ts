import { describe, expect, it } from 'vitest';
import {
  FIELD_PROVENANCE_KEY,
  agentProvenanceMetadataPatch,
  countAgentFilledFields,
  isAgentFilled,
  isAgentFilledForDisplay,
  listAgentFilledKeys,
  provenanceKeysFromMergeTouched,
  readFieldProvenance,
  stampAgentFields,
  stampUserFields,
} from '@/lib/task-field-provenance';
import { detectUserDemotedProvenanceKeys } from '@/lib/task-field-provenance-demote';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';

describe('task-field-provenance', () => {
  it('stamps agent keys into field_provenance sidecar', () => {
    const next = stampAgentFields({ location: 'Gym' }, ['location', 'title'], {
      agentSlug: 'coach',
      at: '2026-07-30T12:00:00.000Z',
    });
    const map = readFieldProvenance(next);
    expect(map.location).toEqual({
      by: 'agent',
      agent_slug: 'coach',
      at: '2026-07-30T12:00:00.000Z',
    });
    expect(map.title?.by).toBe('agent');
    expect(next.location).toBe('Gym');
  });

  it('demotes agent keys to user on overwrite', () => {
    const stamped = stampAgentFields({}, ['workout_type'], { at: '2026-01-01T00:00:00.000Z' });
    const demoted = stampUserFields(stamped, ['workout_type']);
    expect(isAgentFilled(demoted, 'workout_type')).toBe(false);
    expect(readFieldProvenance(demoted).workout_type?.by).toBe('user');
  });

  it('isAgentFilledForDisplay clears tint for demoted keys before persist', () => {
    const meta = stampAgentFields({}, ['location', 'url']);
    expect(isAgentFilledForDisplay(meta, 'location', ['location'])).toBe(false);
    expect(isAgentFilledForDisplay(meta, 'url', ['location'])).toBe(true);
    expect(countAgentFilledFields(meta)).toBe(2);
    expect(listAgentFilledKeys(meta)).toEqual(['location', 'url']);
  });

  it('maps structural merge touches to blocks + factory keys', () => {
    expect(provenanceKeysFromMergeTouched(['warmup', 'duration_min'])).toEqual([
      'blocks',
      'ai_workout_factory',
      'duration_min',
    ]);
  });

  it('agentProvenanceMetadataPatch returns only field_provenance', () => {
    const patch = agentProvenanceMetadataPatch({ foo: 1 }, ['title']);
    expect(patch).not.toBeNull();
    expect(Object.keys(patch!)).toEqual([FIELD_PROVENANCE_KEY]);
    expect(isAgentFilled(patch, 'title')).toBe(true);
  });
});

describe('detectUserDemotedProvenanceKeys', () => {
  it('detects title and event location changes vs original snapshot', () => {
    const fields = {
      ...metadataFieldsFromParsed({ location: 'Home' }),
      eventLocation: 'Park',
    };
    const keys = detectUserDemotedProvenanceKeys({
      itemType: 'event',
      fields,
      title: 'New title',
      description: 'Same',
      original: {
        title: 'Old title',
        description: 'Same',
        status: 'todo',
        priority: 'medium',
        scheduledOn: null,
        scheduledTime: null,
        itemType: 'event',
        visibility: 'private',
        assignedTo: null,
        metadataJson: JSON.stringify({ location: 'Home' }),
      },
    });
    expect(keys).toEqual(expect.arrayContaining(['title', 'location']));
    expect(keys).not.toContain('description');
  });

  it('demotes exercises and blocks when workout exercises form changes', () => {
    const origExercises = [{ name: 'Squat', sets: 3, reps: '5' }];
    const fields = {
      ...metadataFieldsFromParsed({ exercises: origExercises }),
      workoutExercises: [{ name: 'Deadlift', sets: 3, reps: '5' }],
    };
    const keys = detectUserDemotedProvenanceKeys({
      itemType: 'workout',
      fields,
      title: 'Session',
      description: '',
      original: {
        title: 'Session',
        description: '',
        status: 'todo',
        priority: 'medium',
        scheduledOn: null,
        scheduledTime: null,
        itemType: 'workout',
        visibility: 'private',
        assignedTo: null,
        metadataJson: JSON.stringify({ exercises: origExercises }),
      },
    });
    expect(keys).toEqual(expect.arrayContaining(['exercises', 'blocks']));
  });
});
