import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionControlsActions } from './SessionControlsActions';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';

vi.mock('@/features/live-video/theater/live-session-runtime-context', () => ({
  useLiveSessionRuntime: () => ({
    supabase: {},
    sessionId: '11111111-1111-4111-8111-111111111111',
    isHost: true,
    localUserId: 'host-user',
    realtimeChannel: null,
  }),
}));

vi.mock('@/features/live-video/shells/huddle/workout-deck-selection-context', () => ({
  useWorkoutDeckSelectionOptional: () => null,
}));

vi.mock('@/features/live-video/contexts/WrapperAttachContext', () => ({
  useWrapperAttach: () => ({ setOverride: vi.fn() }),
}));

const idleState = {
  status: 'idle',
  phase: 'lobby',
  aspectRatio: '16:9',
} as SessionState;

const actions = {
  startSession: vi.fn(),
  endSession: vi.fn(),
} as unknown as SessionActions;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionControlsActions solo studio', () => {
  it('relabels end control to End studio when isSoloStudio', () => {
    render(
      <SessionControlsActions
        state={{ ...idleState, status: 'running' } as SessionState}
        actions={actions}
        onHostEndLiveSessionForAll={vi.fn()}
        isSoloStudio
      />,
    );
    expect(screen.getByRole('button', { name: 'End studio' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'End Session for All' })).toBeNull();
  });

  it('shows Record when isSoloStudio and soloRecorder idle', () => {
    render(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        isSoloStudio
        soloRecorder={{
          status: 'idle',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
  });

  it('shows Stop recording when soloRecorder is recording', () => {
    render(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        isSoloStudio
        soloRecorder={{
          status: 'recording',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('hides Record for open huddles', () => {
    render(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        soloRecorder={{
          status: 'idle',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('keeps End Session for All for open huddles', () => {
    render(
      <SessionControlsActions
        state={{ ...idleState, status: 'running' } as SessionState}
        actions={actions}
        onHostEndLiveSessionForAll={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'End Session for All' })).toBeTruthy();
  });

  it('shows Teleprompter toggle only in Solo Studio when change handler is provided', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        isSoloStudio
        soloRecorder={{
          status: 'idle',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
        teleprompterEnabled={false}
        onTeleprompterEnabledChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Teleprompter: Off' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Teleprompter: Off' }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        soloRecorder={{
          status: 'idle',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
        teleprompterEnabled={false}
        onTeleprompterEnabledChange={onChange}
      />,
    );
    expect(screen.queryByRole('button', { name: /Teleprompter:/i })).toBeNull();
  });

  it('labels Teleprompter: On when enabled', () => {
    render(
      <SessionControlsActions
        state={idleState}
        actions={actions}
        isSoloStudio
        soloRecorder={{
          status: 'idle',
          onStart: vi.fn(),
          onStop: vi.fn(),
        }}
        teleprompterEnabled
        onTeleprompterEnabledChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Teleprompter: On' })).toBeTruthy();
  });
});
