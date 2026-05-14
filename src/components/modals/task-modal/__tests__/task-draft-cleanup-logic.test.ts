import { describe, it, expect } from 'vitest';
import {
  isDraftUntouched,
  buildCurrentDraftSnapshot,
  type TaskDraftBaseline,
} from '@/components/modals/task-modal/task-draft-types';

describe('task-draft-types / draft untouched', () => {
  const base: TaskDraftBaseline = {
    title: 'Untitled',
    description: null,
    metadataJson: '{}',
    priority: 'medium',
    visibility: 'private',
    status: 'todo',
    position: 0,
    scheduledOn: '',
    scheduledTime: '',
    attachmentsJson: '[]',
    subtasksJson: '[]',
  };

  it('isDraftUntouched is true when snapshot matches baseline', () => {
    const cur = buildCurrentDraftSnapshot({
      title: 'Untitled',
      description: '',
      metadataForSave: {},
      priority: 'medium',
      visibility: 'private',
      status: 'todo',
      position: 0,
      scheduledOn: '',
      scheduledTime: '',
      attachments: [],
      subtasks: [],
    });
    expect(isDraftUntouched(base, cur)).toBe(true);
  });

  it('isDraftUntouched is false when title changes', () => {
    const cur = buildCurrentDraftSnapshot({
      title: 'Hello',
      description: '',
      metadataForSave: {},
      priority: 'medium',
      visibility: 'private',
      status: 'todo',
      position: 0,
      scheduledOn: '',
      scheduledTime: '',
      attachments: [],
      subtasks: [],
    });
    expect(isDraftUntouched(base, cur)).toBe(false);
  });
});
