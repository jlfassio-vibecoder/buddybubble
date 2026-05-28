import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SystemAnalyticsDashboard } from '@/features/analytics/system/SystemAnalyticsDashboard';
import type { SystemAnalyticsEventRow } from '@/features/analytics/system/system-analytics-types';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  usePathname: () => '/app/ws-1/analytics/system',
  useSearchParams: () => new URLSearchParams('window=30d&filter=all'),
}));

vi.mock('@/lib/feature-flags/workoutBuilderRoute', () => ({
  isWorkoutBuilderRouteEnabled: () => true,
}));

const track = vi.fn();
vi.mock('@/lib/analytics/client', () => ({
  track: (...args: unknown[]) => track(...args),
}));

const baseRow: SystemAnalyticsEventRow = {
  id: 'evt-1',
  created_at: '2026-05-28T12:00:00.000Z',
  actor_user_id: 'user-1',
  actor_display: 'Coach Alex',
  surface: 'workout_builder',
  event_type: 'error_parse',
  error_kind: 'parse',
  task_id: 'task-abc-123',
  prompt_tokens: 100,
  completion_tokens: 50,
  thoughts_tokens: 10,
  request_id: 'req-xyz-789',
  agent_slug: 'workout-coach',
};

describe('SystemAnalyticsDashboard', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    track.mockClear();
    vi.stubGlobal(
      'navigator',
      Object.assign({}, navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('renders error rows with expected columns', () => {
    render(
      <SystemAnalyticsDashboard
        workspaceId="ws-1"
        workspaceName="Test Studio"
        window="30d"
        filter="all"
        summary={{ successCount: 5, errorCount: 1, totalTokens: 160, avgLatencyMs: 1200 }}
        errorRows={[baseRow]}
        hasMore={false}
        nextCursor={null}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText('Coach Alex')).toBeTruthy();
    expect(within(table).getByText('Parse')).toBeTruthy();
    expect(within(table).getByText('Workout builder')).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Review Workout' })).toBeTruthy();
  });

  it('shows copy request ID when task_id is null', () => {
    render(
      <SystemAnalyticsDashboard
        workspaceId="ws-1"
        workspaceName="Test Studio"
        window="30d"
        filter="all"
        summary={{ successCount: 0, errorCount: 1, totalTokens: 0, avgLatencyMs: null }}
        errorRows={[{ ...baseRow, task_id: null }]}
        hasMore={false}
        nextCursor={null}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('button', { name: /copy request id/i })).toBeTruthy();
    expect(within(table).queryByRole('button', { name: 'Review Workout' })).toBeNull();
  });

  it('Review Workout navigates with system_analytics launch context', () => {
    render(
      <SystemAnalyticsDashboard
        workspaceId="ws-1"
        workspaceName="Test Studio"
        window="30d"
        filter="all"
        summary={{ successCount: 0, errorCount: 1, totalTokens: 160, avgLatencyMs: null }}
        errorRows={[baseRow]}
        hasMore={false}
        nextCursor={null}
      />,
    );

    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'Review Workout' }));

    expect(track).toHaveBeenCalledWith('system_analytics_recovery_clicked', {
      workspace_id: 'ws-1',
      metadata: { task_id: 'task-abc-123', request_id: 'req-xyz-789' },
    });
    expect(push).toHaveBeenCalledWith(
      '/app/ws-1/builder/task-abc-123?from=system_analytics&return=%2Fapp%2Fws-1%2Fanalytics%2Fsystem',
    );
  });

  it('filter chip updates search params', () => {
    render(
      <SystemAnalyticsDashboard
        workspaceId="ws-1"
        workspaceName="Test Studio"
        window="30d"
        filter="all"
        summary={{ successCount: 1, errorCount: 0, totalTokens: 0, avgLatencyMs: null }}
        errorRows={[]}
        hasMore={false}
        nextCursor={null}
      />,
    );

    const filterButtons = screen.getAllByRole('button', { name: 'Parse' });
    fireEvent.click(filterButtons[0]!);
    expect(replace).toHaveBeenCalledWith(
      '/app/ws-1/analytics/system?window=30d&filter=error_parse',
    );
  });
});
