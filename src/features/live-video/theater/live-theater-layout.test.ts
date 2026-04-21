import { describe, expect, it } from 'vitest';
import {
  deriveLiveTheaterLayoutPlan,
  sessionUiKindFromSessionState,
} from '@/features/live-video/theater/live-theater-layout.types';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';

describe('sessionUiKindFromSessionState', () => {
  it('returns builder when idle with no global start', () => {
    expect(sessionUiKindFromSessionState(initialSessionState)).toBe('builder');
  });

  it('returns live when globalStartedAt set', () => {
    expect(
      sessionUiKindFromSessionState({
        ...initialSessionState,
        status: 'running',
        globalStartedAt: 1,
      }),
    ).toBe('live');
  });

  it('returns live when status not idle', () => {
    expect(
      sessionUiKindFromSessionState({
        ...initialSessionState,
        status: 'running',
        globalStartedAt: null,
      }),
    ).toBe('live');
  });
});

describe('deriveLiveTheaterLayoutPlan', () => {
  const base = {
    hasLiveVideoSession: true,
    isSelectingFromBoard: false,
    layoutMobile: false,
    embedMode: false,
    layoutHydrated: true,
  } as const;

  it('is inactive when no session', () => {
    const p = deriveLiveTheaterLayoutPlan({ ...base, hasLiveVideoSession: false });
    expect(p.active).toBe(false);
    expect(p.shell.kind).toBe('inactive');
  });

  it('is inactive when not layout hydrated', () => {
    const p = deriveLiveTheaterLayoutPlan({ ...base, layoutHydrated: false });
    expect(p.active).toBe(false);
  });

  it('theater_board_split when selecting from board (desktop)', () => {
    const p = deriveLiveTheaterLayoutPlan({
      ...base,
      isSelectingFromBoard: true,
      sessionUiKind: 'live',
    });
    expect(p.active).toBe(true);
    expect(p.phase).toBe('deck_building');
    expect(p.shell.kind).toBe('theater_board_split');
    expect(p.shell.showHorizontalBoardStage).toBe(true);
    expect(p.huddle.minimizeVideoInDock).toBe(true);
  });

  it('theater_focus when live session and not selecting (desktop)', () => {
    const p = deriveLiveTheaterLayoutPlan({
      ...base,
      sessionUiKind: 'live',
    });
    expect(p.phase).toBe('live_video');
    expect(p.shell.kind).toBe('theater_focus');
    expect(p.shell.showHorizontalBoardStage).toBe(false);
    expect(p.huddle.maximizeVideoInDock).toBe(true);
  });

  it('theater_focus when builder and not selecting (desktop)', () => {
    const p = deriveLiveTheaterLayoutPlan({
      ...base,
      sessionUiKind: 'builder',
    });
    expect(p.phase).toBe('deck_building');
    expect(p.shell.kind).toBe('theater_focus');
    expect(p.shell.showHorizontalBoardStage).toBe(false);
    expect(p.huddle.minimizeVideoInDock).toBe(true);
  });

  it('vertical compact on mobile', () => {
    const p = deriveLiveTheaterLayoutPlan({
      ...base,
      layoutMobile: true,
      sessionUiKind: 'live',
    });
    expect(p.shell.kind).toBe('vertical_compact_session');
  });

  it('defaults sessionUiKind to builder and keeps theater_focus until selecting', () => {
    const p = deriveLiveTheaterLayoutPlan({ ...base, sessionUiKind: undefined });
    expect(p.phase).toBe('deck_building');
    expect(p.shell.kind).toBe('theater_focus');
    expect(p.shell.showHorizontalBoardStage).toBe(false);
  });
});
