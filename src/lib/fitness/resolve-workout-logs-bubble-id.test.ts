import { describe, expect, it, vi } from 'vitest';
import {
  resolveWorkoutLogsBubbleId,
  WORKOUT_LOGS_BUBBLE_NAME,
} from '@/lib/fitness/resolve-workout-logs-bubble-id';

describe('resolveWorkoutLogsBubbleId', () => {
  it('returns Workout Logs bubble id when present', async () => {
    const logsBubbleId = 'wl-bubble-123';
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: logsBubbleId }, error: null })),
            })),
          })),
        })),
      })),
    };

    const result = await resolveWorkoutLogsBubbleId(
      supabase as never,
      'workspace-1',
      'fallback-bubble',
    );

    expect(result).toBe(logsBubbleId);
    expect(supabase.from).toHaveBeenCalledWith('bubbles');
  });

  it('falls back to source bubble when Workout Logs channel is missing', async () => {
    const fallback = 'source-bubble-456';
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      })),
    };

    const result = await resolveWorkoutLogsBubbleId(supabase as never, 'workspace-1', fallback);

    expect(result).toBe(fallback);
  });

  it('exports stable bubble name constant', () => {
    expect(WORKOUT_LOGS_BUBBLE_NAME).toBe('Workout Logs');
  });
});
