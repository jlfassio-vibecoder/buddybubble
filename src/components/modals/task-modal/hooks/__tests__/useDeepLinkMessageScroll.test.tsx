import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useDeepLinkMessageScroll } from '@/components/modals/task-modal/hooks/useDeepLinkMessageScroll';

function Harness(props: Parameters<typeof useDeepLinkMessageScroll>[0]) {
  useDeepLinkMessageScroll(props);
  return null;
}

describe('useDeepLinkMessageScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-message-id="msg-deep"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('scrolls once when message id exists in messages', async () => {
    const scrollIntoView = vi.fn();
    const el = document.querySelector('[data-message-id="msg-deep"]') as HTMLElement;
    el.scrollIntoView = scrollIntoView;

    render(
      <Harness
        taskId="t1"
        initialCommentThreadMessageId="msg-deep"
        isLoading={false}
        messages={[{ id: 'msg-deep' }]}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
