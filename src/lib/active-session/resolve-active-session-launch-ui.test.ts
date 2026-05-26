import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SESSION_ADD_TITLE_TOOLTIP,
  ACTIVE_SESSION_LAUNCH_LABEL,
  ACTIVE_SESSION_SAVE_AND_START_LABEL,
  ACTIVE_SESSION_SAVE_TO_START_TOOLTIP,
  resolveActiveSessionLaunchUi,
} from '@/lib/active-session/resolve-active-session-launch-ui';

const base = {
  routeEnabled: true,
  itemType: 'workout' as const,
  canWrite: true,
  taskId: 'task-1',
  coreDirty: false,
  saving: false,
  exerciseCount: 3,
  titleTrimmed: true,
};

describe('resolveActiveSessionLaunchUi', () => {
  it('returns hidden when route flag is off', () => {
    expect(resolveActiveSessionLaunchUi({ ...base, routeEnabled: false }).mode).toBe('hidden');
  });

  it('returns hidden for non-workout item types', () => {
    expect(resolveActiveSessionLaunchUi({ ...base, itemType: 'task' }).mode).toBe('hidden');
    expect(resolveActiveSessionLaunchUi({ ...base, itemType: 'workout_log' }).mode).toBe('hidden');
  });

  it('returns hidden when there are no exercises', () => {
    expect(resolveActiveSessionLaunchUi({ ...base, exerciseCount: 0 }).mode).toBe('hidden');
  });

  it('returns launch for saved clean edit', () => {
    const ui = resolveActiveSessionLaunchUi(base);
    expect(ui).toEqual({ mode: 'launch', label: ACTIVE_SESSION_LAUNCH_LABEL });
  });

  it('returns save_and_start for create mode', () => {
    const ui = resolveActiveSessionLaunchUi({ ...base, taskId: null });
    expect(ui).toEqual({ mode: 'save_and_start', label: ACTIVE_SESSION_SAVE_AND_START_LABEL });
  });

  it('returns save_and_start for dirty edit', () => {
    const ui = resolveActiveSessionLaunchUi({ ...base, coreDirty: true });
    expect(ui).toEqual({ mode: 'save_and_start', label: ACTIVE_SESSION_SAVE_AND_START_LABEL });
  });

  it('disables when not writable', () => {
    const ui = resolveActiveSessionLaunchUi({ ...base, canWrite: false });
    expect(ui).toEqual({
      mode: 'disabled',
      label: ACTIVE_SESSION_LAUNCH_LABEL,
      tooltip: ACTIVE_SESSION_SAVE_TO_START_TOOLTIP,
    });
  });

  it('disables while saving', () => {
    const ui = resolveActiveSessionLaunchUi({ ...base, saving: true });
    expect(ui.mode).toBe('disabled');
    expect(ui).toMatchObject({ tooltip: ACTIVE_SESSION_SAVE_TO_START_TOOLTIP });
  });

  it('disables save_and_start when title is empty', () => {
    const ui = resolveActiveSessionLaunchUi({
      ...base,
      taskId: null,
      titleTrimmed: false,
    });
    expect(ui).toEqual({
      mode: 'disabled',
      label: ACTIVE_SESSION_SAVE_AND_START_LABEL,
      tooltip: ACTIVE_SESSION_ADD_TITLE_TOOLTIP,
    });
  });
});
