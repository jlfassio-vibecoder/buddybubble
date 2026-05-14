import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useTaskCommentsViewedMarker } from '@/components/modals/task-modal/hooks/useTaskCommentsViewedMarker';

const upsertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

function Harness(props: Parameters<typeof useTaskCommentsViewedMarker>[0]) {
  useTaskCommentsViewedMarker(props);
  return null;
}

describe('useTaskCommentsViewedMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces user_task_views upsert then calls onMarkedRead', async () => {
    const onMarkedRead = vi.fn();
    render(<Harness enabled taskId="task-1" userId="user-1" onMarkedRead={onMarkedRead} />);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(upsertMock).toHaveBeenCalled();
    expect(onMarkedRead).toHaveBeenCalled();
  });
});
