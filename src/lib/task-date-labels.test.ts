import { describe, expect, it } from 'vitest';
import { taskDateFieldLabels } from '@/lib/task-date-labels';

describe('taskDateFieldLabels', () => {
  it('returns kids copy', () => {
    const l = taskDateFieldLabels('kids');
    expect(l.primary).toBe('Scheduled on');
    expect(l.short).toBe('Scheduled');
  });

  it('returns community copy', () => {
    const l = taskDateFieldLabels('community');
    expect(l.primary).toBe('Scheduled for');
    expect(l.short).toBe('Event date');
  });

  it('defaults unknown category to business-style', () => {
    const l = taskDateFieldLabels(null);
    expect(l.primary).toBe('Due by');
  });
});
