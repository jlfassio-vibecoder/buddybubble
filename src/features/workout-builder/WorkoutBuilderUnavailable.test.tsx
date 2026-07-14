import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkoutBuilderUnavailable } from '@/features/workout-builder/WorkoutBuilderUnavailable';

describe('WorkoutBuilderUnavailable', () => {
  it('renders disabled message without generic Page not found copy', () => {
    const html = renderToStaticMarkup(
      <WorkoutBuilderUnavailable workspaceId="ws-1" taskId="task-1" reason="disabled" />,
    );
    expect(html).toContain('Structure builder unavailable');
    expect(html).toContain('temporarily turned off');
    expect(html).toContain('reason=disabled');
    expect(html).not.toContain('Page not found');
  });

  it('renders task_not_found and uses safe return path for Back', () => {
    const html = renderToStaticMarkup(
      <WorkoutBuilderUnavailable
        workspaceId="ws-1"
        taskId="task-1"
        reason="task_not_found"
        returnPath="/app/ws-1#board"
      />,
    );
    expect(html).toContain('could not be found');
    expect(html).toContain('href="/app/ws-1#board"');
  });

  it('rejects protocol-relative return and falls back to workspace home', () => {
    const html = renderToStaticMarkup(
      <WorkoutBuilderUnavailable
        workspaceId="ws-1"
        reason="not_member"
        returnPath="//evil.example"
      />,
    );
    expect(html).toContain('href="/app/ws-1"');
    expect(html).not.toContain('evil.example');
  });
});
