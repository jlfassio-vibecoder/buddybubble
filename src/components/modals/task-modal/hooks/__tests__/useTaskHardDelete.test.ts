import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTaskHardDelete,
  TaskHardDeleteBlockedError,
} from '@/components/modals/task-modal/hooks/useTaskHardDelete';
import { createClient } from '@utils/supabase/client';

vi.mock('@utils/supabase/client', () => ({
  createClient: vi.fn(),
}));

describe('useTaskHardDelete', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('calls delete for a non-program task', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: del }),
    } as never);

    const { result } = renderHook(() => useTaskHardDelete());
    await act(async () => {
      await result.current.hardDeleteTask('t1', { itemType: 'task' });
    });
    expect(vi.mocked(createClient).mock.results[0]?.value.from).toHaveBeenCalledWith('tasks');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 't1');
  });

  it('throws TaskHardDeleteBlockedError when program has children', async () => {
    const childEq = vi.fn().mockResolvedValue({ count: 2, error: null });
    const select = vi.fn().mockReturnValue({ eq: childEq });
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select }),
    } as never);

    const { result } = renderHook(() => useTaskHardDelete());
    await expect(result.current.hardDeleteTask('prog-1', { itemType: 'program' })).rejects.toThrow(
      TaskHardDeleteBlockedError,
    );
  });

  it('deletes program when there are no children', async () => {
    const delEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: delEq });
    const childEq = vi.fn().mockResolvedValue({ count: 0, error: null });
    const select = vi.fn().mockReturnValue({ eq: childEq });
    let call = 0;
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) {
          return { select };
        }
        return { delete: del };
      }),
    } as never);

    const { result } = renderHook(() => useTaskHardDelete());
    await act(async () => {
      await result.current.hardDeleteTask('prog-1', { itemType: 'program' });
    });
    expect(del).toHaveBeenCalled();
    expect(delEq).toHaveBeenCalledWith('id', 'prog-1');
  });
});
