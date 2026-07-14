import { describe, expect, it, vi } from 'vitest';
import {
  isValidUuid,
  parseSavePersonalCuesBody,
  resolveDictionaryIdForPersonalSave,
} from '@/lib/workout-factory/save-personal-exercise-cues-server';

describe('save-personal-exercise-cues-server', () => {
  it('parseSavePersonalCuesBody accepts valid payload', () => {
    const parsed = parseSavePersonalCuesBody({
      exercise_name: 'Goblet Squat',
      dictionary_id: '00000000-0000-4000-8000-000000000001',
      patch: { form_cues: 'Knees out' },
      mode: 'replace',
    });
    expect(parsed).toEqual({
      exercise_name: 'Goblet Squat',
      dictionary_id: '00000000-0000-4000-8000-000000000001',
      patch: { form_cues: 'Knees out' },
      mode: 'replace',
    });
  });

  it('parseSavePersonalCuesBody rejects empty patch', () => {
    expect(
      parseSavePersonalCuesBody({
        exercise_name: 'Squat',
        patch: { instructions: '  ' },
      }),
    ).toBeNull();
  });

  it('isValidUuid validates uuid shape', () => {
    expect(isValidUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
  });

  it('resolveDictionaryIdForPersonalSave uses hint when row exists', async () => {
    const dictId = '00000000-0000-4000-8000-000000000042';
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: dictId }, error: null }),
          })),
        })),
      })),
      rpc: vi.fn(),
    };
    const result = await resolveDictionaryIdForPersonalSave(client as never, {
      exerciseName: 'Squat',
      dictionaryIdHint: dictId,
      userId: 'user-1',
    });
    expect(result).toBe(dictId);
  });

  it('resolveDictionaryIdForPersonalSave rejects missing dictionary_id hint', async () => {
    const dictId = '00000000-0000-4000-8000-000000000042';
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      rpc: vi.fn(),
    };
    await expect(
      resolveDictionaryIdForPersonalSave(client as never, {
        exerciseName: 'Squat',
        dictionaryIdHint: dictId,
        userId: 'user-1',
      }),
    ).rejects.toThrow('dictionary_id_not_found');
  });

  it('resolveDictionaryIdForPersonalSave inserts stub when lookup misses', async () => {
    const newId = '00000000-0000-4000-8000-000000000099';
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'exercise_dictionary') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
              })),
            })),
          };
        }
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const result = await resolveDictionaryIdForPersonalSave(client as never, {
      exerciseName: 'Custom Move',
      dictionaryIdHint: null,
      userId: 'user-1',
    });
    expect(result).toBe(newId);
  });

  it('resolveDictionaryIdForPersonalSave ignores rpc rows without exact name match', async () => {
    const newId = '00000000-0000-4000-8000-000000000088';
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'exercise_dictionary') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
              })),
            })),
          };
        }
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [{ id: '00000000-0000-4000-8000-000000000077', name: 'Different Exercise' }],
        error: null,
      }),
    };
    const result = await resolveDictionaryIdForPersonalSave(client as never, {
      exerciseName: 'Custom Move',
      dictionaryIdHint: null,
      userId: 'user-1',
    });
    expect(result).toBe(newId);
  });
});
