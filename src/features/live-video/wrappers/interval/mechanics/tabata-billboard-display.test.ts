import { describe, expect, it } from 'vitest';

import {
  resolveTabataBillboardModel,
  TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
  TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
  type TabataBillboardModel,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-billboard-display';
import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
  type TabataSegment,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { TabataFormatParams } from '@/lib/workout-factory/types/tabata-format-params';

function makeMechanics(
  partial: Partial<TabataMechanicsState> & { segment: TabataSegment },
): TabataMechanicsState {
  const base = buildInitialTabataMechanicsState({
    totalRounds: 4,
    workSeconds: 30,
    restSeconds: 15,
  });
  return {
    ...base,
    ...partial,
    segment_started_at:
      partial.segment_started_at !== undefined
        ? partial.segment_started_at
        : partial.segment === 'idle' || partial.segment === 'done'
          ? null
          : '2026-07-15T10:00:00.000Z',
  };
}

const PASSIVE_EXERCISES = [{ name: 'Burpees' }, { name: 'Push-ups' }];

describe('resolveTabataBillboardModel', () => {
  describe('null / idle / done', () => {
    it.each([
      { label: 'null mechanics', mechanics: null as TabataMechanicsState | null },
      { label: 'idle', mechanics: makeMechanics({ segment: 'idle', round_index: 0 }) },
      { label: 'done', mechanics: makeMechanics({ segment: 'done', round_index: 4 }) },
    ])('returns null for $label', ({ mechanics }) => {
      expect(
        resolveTabataBillboardModel({
          mechanics,
          exercises: PASSIVE_EXERCISES,
          elapsedSec: 0,
        }),
      ).toBeNull();
    });
  });

  describe('passive multi-station', () => {
    const cases: Array<{
      name: string;
      segment: TabataSegment;
      round_index: number;
      elapsedSec: number;
      expect: TabataBillboardModel | null;
    }> = [
      {
        name: 'setup always shows first work name',
        segment: 'setup',
        round_index: 0,
        elapsedSec: 5,
        expect: {
          visible: true,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: null,
        },
      },
      {
        name: 'work visible before 3s fade',
        segment: 'work',
        round_index: 1,
        elapsedSec: 2.5,
        expect: {
          visible: true,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
        },
      },
      {
        name: 'work faded at exactly 3s',
        segment: 'work',
        round_index: 1,
        elapsedSec: 3.0,
        expect: {
          visible: false,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
        },
      },
      {
        name: 'work faded after 3s',
        segment: 'work',
        round_index: 1,
        elapsedSec: 3.5,
        expect: {
          visible: false,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
        },
      },
      {
        name: 'rest shows Next: look-ahead at start',
        segment: 'rest',
        round_index: 1,
        elapsedSec: 0,
        expect: {
          visible: true,
          prefix: 'next',
          name: 'Push-ups',
          fadeAfterSec: null,
        },
      },
      {
        name: 'rest stays visible for full segment',
        segment: 'rest',
        round_index: 1,
        elapsedSec: 10,
        expect: {
          visible: true,
          prefix: 'next',
          name: 'Push-ups',
          fadeAfterSec: null,
        },
      },
      {
        name: 'last rest before done hides billboard',
        segment: 'rest',
        round_index: 4,
        elapsedSec: 1,
        expect: null,
      },
    ];

    it.each(cases)('$name', ({ segment, round_index, elapsedSec, expect: expected }) => {
      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({ segment, round_index, total_rounds: 4 }),
          exercises: PASSIVE_EXERCISES,
          elapsedSec,
        }),
      ).toEqual(expected);
    });
  });

  describe('active rest Hi/Low', () => {
    const formatParams: TabataFormatParams = {
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 4,
      rest_mode: 'active',
      active_rest_exercises: ['Jogging'],
    };
    const highs = [{ name: 'Burpees' }];

    const cases: Array<{
      name: string;
      segment: TabataSegment;
      elapsedSec: number;
      expect: TabataBillboardModel;
    }> = [
      {
        name: 'work visible before 5s fade',
        segment: 'work',
        elapsedSec: 4.5,
        expect: {
          visible: true,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
      },
      {
        name: 'work faded after 5s',
        segment: 'work',
        elapsedSec: 5.5,
        expect: {
          visible: false,
          prefix: null,
          name: 'Burpees',
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
      },
      {
        name: 'rest visible before 5s fade with bare low name',
        segment: 'rest',
        elapsedSec: 4.5,
        expect: {
          visible: true,
          prefix: null,
          name: 'Jogging',
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
      },
      {
        name: 'rest faded after 5s',
        segment: 'rest',
        elapsedSec: 5.5,
        expect: {
          visible: false,
          prefix: null,
          name: 'Jogging',
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
      },
    ];

    it.each(cases)('$name', ({ segment, elapsedSec, expect: expected }) => {
      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({
            segment,
            round_index: 1,
            total_rounds: 4,
            work_seconds: 45,
            rest_seconds: 15,
          }),
          formatParams,
          exercises: highs,
          elapsedSec,
        }),
      ).toEqual(expected);
    });
  });

  describe('zero-rest circuit', () => {
    it('setup and work use passive fade; no rest branch', () => {
      const exercises = [{ name: 'Push' }, { name: 'Pull' }];
      const formatParams: TabataFormatParams = {
        work_seconds: 30,
        rest_seconds: 0,
        rounds: 2,
      };

      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({
            segment: 'setup',
            round_index: 0,
            total_rounds: 4,
            rest_seconds: 0,
          }),
          formatParams,
          exercises,
          elapsedSec: 2,
        }),
      ).toEqual({
        visible: true,
        prefix: null,
        name: 'Push',
        fadeAfterSec: null,
      });

      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({
            segment: 'work',
            round_index: 2,
            total_rounds: 4,
            rest_seconds: 0,
          }),
          formatParams,
          exercises,
          elapsedSec: 2.5,
        }),
      ).toEqual({
        visible: true,
        prefix: null,
        name: 'Pull',
        fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
      });

      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({
            segment: 'work',
            round_index: 2,
            total_rounds: 4,
            rest_seconds: 0,
          }),
          formatParams,
          exercises,
          elapsedSec: 3.5,
        })?.visible,
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('falls back to Movement for blank multi-station names', () => {
      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({ segment: 'work', round_index: 1, total_rounds: 4 }),
          exercises: [{ name: '  ' }, { name: 'B' }],
          elapsedSec: 1,
        }),
      ).toEqual({
        visible: true,
        prefix: null,
        name: 'Movement',
        fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
      });
    });

    it('shows Movement on setup when exercises are empty', () => {
      expect(
        resolveTabataBillboardModel({
          mechanics: makeMechanics({ segment: 'setup', round_index: 0 }),
          exercises: [],
          elapsedSec: 0,
        }),
      ).toEqual({
        visible: true,
        prefix: null,
        name: 'Movement',
        fadeAfterSec: null,
      });
    });

    it('is deterministic for the same frozen elapsedSec (pause-safe)', () => {
      const args = {
        mechanics: makeMechanics({ segment: 'work', round_index: 1, total_rounds: 4 }),
        exercises: PASSIVE_EXERCISES,
        elapsedSec: 2.5,
      };
      expect(resolveTabataBillboardModel(args)).toEqual(resolveTabataBillboardModel(args));
    });
  });
});
