import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProgramEnrollment } from '@/hooks/use-program-enrollment';

const listMock = vi.fn();
const enrollMock = vi.fn();
const unenrollMock = vi.fn();

vi.mock('@/lib/programs/program-enrollment', () => ({
  listProgramEnrollments: (...args: unknown[]) => listMock(...args),
  enrollProgram: (...args: unknown[]) => enrollMock(...args),
  unenrollProgram: (...args: unknown[]) => unenrollMock(...args),
}));

describe('useProgramEnrollment', () => {
  beforeEach(() => {
    listMock.mockReset();
    enrollMock.mockReset();
    unenrollMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads enrollments and exposes enrolledCount / myEnrollment', async () => {
    listMock.mockResolvedValue([
      {
        id: 'e1',
        workspace_id: 'w1',
        task_id: 't1',
        user_id: 'u1',
        status: 'enrolled',
        created_at: '2026-08-01T00:00:00Z',
        displayName: 'Alex',
        avatarUrl: null,
      },
    ]);

    const { result } = renderHook(() =>
      useProgramEnrollment({
        taskId: 't1',
        workspaceId: 'w1',
        currentUserId: 'u1',
        capacity: 10,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enrolledCount).toBe(1);
    expect(result.current.myEnrollment?.id).toBe('e1');
  });

  it('refuses enroll when at capacity', async () => {
    listMock.mockResolvedValue([
      {
        id: 'e1',
        workspace_id: 'w1',
        task_id: 't1',
        user_id: 'other',
        status: 'enrolled',
        created_at: '2026-08-01T00:00:00Z',
        displayName: 'Other',
        avatarUrl: null,
      },
    ]);

    const { result } = renderHook(() =>
      useProgramEnrollment({
        taskId: 't1',
        workspaceId: 'w1',
        currentUserId: 'u1',
        capacity: 1,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    let out: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      out = await result.current.toggleEnroll();
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/capacity/i);
    expect(enrollMock).not.toHaveBeenCalled();
  });
});
