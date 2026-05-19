import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MobileEdgeSwipeOpener } from '@/components/layout/MobileEdgeSwipeOpener';

function swipeRightFromStrip(strip: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(strip, { clientX: 0, clientY: 100, isPrimary: true });
  fireEvent.pointerMove(window, { clientX: dx, clientY: 100 + dy, isPrimary: true });
  fireEvent.pointerUp(window, { isPrimary: true });
}

describe('MobileEdgeSwipeOpener', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onOpen when dx > 32 and |dy| < 24', () => {
    const onOpen = vi.fn();
    const { container } = render(<MobileEdgeSwipeOpener onOpen={onOpen} />);
    const strip = container.firstChild as HTMLElement;
    swipeRightFromStrip(strip, 40);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not call onOpen when dy exceeds threshold', () => {
    const onOpen = vi.fn();
    const { container } = render(<MobileEdgeSwipeOpener onOpen={onOpen} />);
    const strip = container.firstChild as HTMLElement;
    swipeRightFromStrip(strip, 40, 30);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not call onOpen when dx is below threshold', () => {
    const onOpen = vi.fn();
    const { container } = render(<MobileEdgeSwipeOpener onOpen={onOpen} />);
    const strip = container.firstChild as HTMLElement;
    swipeRightFromStrip(strip, 20);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not render when disabled', () => {
    const onOpen = vi.fn();
    const { container } = render(<MobileEdgeSwipeOpener onOpen={onOpen} disabled />);
    expect(container.firstChild).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('removes window listeners on unmount', () => {
    const onOpen = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount, container } = render(<MobileEdgeSwipeOpener onOpen={onOpen} />);
    const moveBefore = addSpy.mock.calls.filter((c) => c[0] === 'pointermove').length;
    unmount();
    const removeMove = removeSpy.mock.calls.filter((c) => c[0] === 'pointermove').length;
    expect(moveBefore).toBeGreaterThan(0);
    expect(removeMove).toBeGreaterThanOrEqual(moveBefore);
    addSpy.mockRestore();
    removeSpy.mockRestore();
    void container;
  });
});
