import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useEventRsvp } from '@/hooks/use-event-rsvp';

const listMock = vi.fn();
const enrollMock = vi.fn();
const unenrollMock = vi.fn();

vi.mock('@/lib/events/event-rsvp', () => ({
  listEventRsvps: (...args: unknown[]) => listMock(...args),
  enrollEventRsvp: (...args: unknown[]) => enrollMock(...args),
  unenrollEventRsvp: (...args: unknown[]) => unenrollMock(...args),
}));

describe('useEventRsvp', () => {
  beforeEach(() => {
    listMock.mockReset();
    enrollMock.mockReset();
    unenrollMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads RSVPs and exposes goingCount / myEnrollment', async () => {
    listMock.mockResolvedValue([
      {
        id: 'r1',
        workspace_id: 'w1',
        task_id: 't1',
        user_id: 'u1',
        status: 'going',
        created_at: '2026-08-01T00:00:00Z',
        displayName: 'Alex',
        avatarUrl: null,
      },
    ]);

    const { result } = renderHook(() =>
      useEventRsvp({
        taskId: 't1',
        workspaceId: 'w1',
        currentUserId: 'u1',
        capacity: 10,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goingCount).toBe(1);
    expect(result.current.myEnrollment?.id).toBe('r1');
  });

  it('refuses enroll when at capacity', async () => {
    listMock.mockResolvedValue([
      {
        id: 'r1',
        workspace_id: 'w1',
        task_id: 't1',
        user_id: 'other',
        status: 'going',
        created_at: '2026-08-01T00:00:00Z',
        displayName: 'Other',
        avatarUrl: null,
      },
    ]);

    const { result } = renderHook(() =>
      useEventRsvp({
        taskId: 't1',
        workspaceId: 'w1',
        currentUserId: 'u1',
        capacity: 1,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    let out: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      out = await result.current.toggleGoing();
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/capacity/i);
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it('unenrolls when already going', async () => {
    listMock.mockResolvedValue([
      {
        id: 'r1',
        workspace_id: 'w1',
        task_id: 't1',
        user_id: 'u1',
        status: 'going',
        created_at: '2026-08-01T00:00:00Z',
        displayName: 'Alex',
        avatarUrl: null,
      },
    ]);
    unenrollMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() =>
      useEventRsvp({
        taskId: 't1',
        workspaceId: 'w1',
        currentUserId: 'u1',
        capacity: null,
      }),
    );

    await waitFor(() => expect(result.current.myEnrollment).toBeTruthy());

    await act(async () => {
      const out = await result.current.toggleGoing();
      expect(out.ok).toBe(true);
    });
    expect(unenrollMock).toHaveBeenCalledWith('r1');
    expect(result.current.goingCount).toBe(0);
  });
});
