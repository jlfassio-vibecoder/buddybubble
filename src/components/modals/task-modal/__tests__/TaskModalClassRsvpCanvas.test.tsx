import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskModalClassRsvpCanvas } from '@/components/modals/task-modal/TaskModalClassRsvpCanvas';

const refetch = vi.fn(async () => {});

vi.mock('@/hooks/useManageClassRoster', () => ({
  useManageClassRoster: () => ({
    enrollments: [
      {
        enrollmentId: 'e1',
        userId: 'u1',
        status: 'enrolled',
        displayName: 'Ada Lovelace',
        role: 'member',
        email: 'ada@example.com',
        avatarUrl: 'https://example.com/ada.png',
      },
      {
        enrollmentId: 'e2',
        userId: 'u2',
        status: 'enrolled',
        displayName: 'Grace Hopper',
        role: 'member',
        email: 'grace@example.com',
        avatarUrl: null,
      },
      {
        enrollmentId: 'e3',
        userId: 'u3',
        status: 'enrolled',
        displayName: 'Alan Turing',
        role: 'member',
        email: 'alan@example.com',
        avatarUrl: null,
      },
      {
        enrollmentId: 'e4',
        userId: 'u4',
        status: 'enrolled',
        displayName: 'Katherine Johnson',
        role: 'member',
        email: 'kj@example.com',
        avatarUrl: null,
      },
      {
        enrollmentId: 'e5',
        userId: 'u5',
        status: 'enrolled',
        displayName: 'Margaret Hamilton',
        role: 'member',
        email: 'mh@example.com',
        avatarUrl: null,
      },
      {
        enrollmentId: 'e6',
        userId: 'u6',
        status: 'enrolled',
        displayName: 'Extra Person',
        role: 'member',
        email: 'x@example.com',
        avatarUrl: null,
      },
      {
        enrollmentId: 'e7',
        userId: 'u7',
        status: 'waitlisted',
        displayName: 'Wait Listed',
        role: 'member',
        email: 'w@example.com',
        avatarUrl: null,
      },
    ],
    candidates: [],
    loading: false,
    error: null,
    addMember: vi.fn(),
    removeMember: vi.fn(),
    sendInviteEmail: vi.fn(),
    mutating: false,
    refetch,
  }),
}));

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { capacity: 18 }, error: null }),
        }),
      }),
    }),
  }),
}));

describe('TaskModalClassRsvpCanvas', () => {
  beforeEach(() => {
    refetch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders reserved count, spots left, progress, and avatar overflow', async () => {
    render(<TaskModalClassRsvpCanvas instanceId="inst-1" workspaceId="ws-1" capacity={18} />);

    expect(screen.getByTestId('task-modal-class-rsvp-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-class-rsvp-reserved').textContent).toContain(
      '6 reserved',
    );
    expect(screen.getByText(/12 spots left/)).toBeTruthy();
    expect(screen.getByTestId('task-modal-class-rsvp-progress')).toBeTruthy();
    expect(screen.getByTestId('task-modal-class-rsvp-avatars')).toBeTruthy();
    expect(screen.getByTestId('task-modal-class-rsvp-avatar-overflow').textContent).toBe('+2');
  });

  it('fetches capacity when not provided and shows manage roster CTA', async () => {
    const onManageRoster = vi.fn();
    render(
      <TaskModalClassRsvpCanvas
        instanceId="inst-1"
        workspaceId="ws-1"
        onManageRoster={onManageRoster}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/12 spots left/)).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('task-modal-class-rsvp-manage'));
    expect(onManageRoster).toHaveBeenCalledTimes(1);
  });

  it('shows unlimited copy when capacity is null', () => {
    render(<TaskModalClassRsvpCanvas instanceId="inst-1" workspaceId="ws-1" capacity={null} />);

    expect(screen.getByText(/Unlimited spots/)).toBeTruthy();
    expect(screen.queryByTestId('task-modal-class-rsvp-progress')).toBeNull();
  });
});
