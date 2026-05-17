import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleScrollChatThreadToBottom } from './chat-thread-auto-scroll';

describe('scheduleScrollChatThreadToBottom', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('uses smooth scroll when focus is outside the composer shell', () => {
    vi.useFakeTimers();
    const scroll = document.createElement('div');
    Object.defineProperty(scroll, 'scrollHeight', { value: 999, configurable: true });
    const spy = vi.spyOn(scroll, 'scrollTo');
    document.body.appendChild(scroll);

    const shell = document.createElement('div');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const dispose = scheduleScrollChatThreadToBottom({ scrollRoot: scroll, composerShell: shell });
    vi.advanceTimersByTime(50);
    expect(spy).toHaveBeenCalledWith({ top: 999, behavior: 'smooth' });
    dispose();
  });

  it('uses synchronous scrollTop when focus is inside the composer shell', () => {
    const scroll = document.createElement('div');
    Object.defineProperty(scroll, 'scrollHeight', { value: 500, configurable: true });
    const shell = document.createElement('div');
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    form.appendChild(input);
    shell.appendChild(form);
    document.body.appendChild(scroll);
    document.body.appendChild(shell);
    input.focus();

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const dispose = scheduleScrollChatThreadToBottom({ scrollRoot: scroll, composerShell: shell });
    dispose();
    expect(scroll.scrollTop).toBe(500);
  });

  it('cancels pending smooth scroll when dispose runs before the timeout', () => {
    vi.useFakeTimers();
    const scroll = document.createElement('div');
    Object.defineProperty(scroll, 'scrollHeight', { value: 1, configurable: true });
    const spy = vi.spyOn(scroll, 'scrollTo');
    document.body.appendChild(scroll);

    const dispose = scheduleScrollChatThreadToBottom({ scrollRoot: scroll, composerShell: null });
    dispose();
    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();
  });
});
