import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LiveSessionTopBar } from './LiveSessionTopBar';

afterEach(() => {
  cleanup();
});

describe('LiveSessionTopBar', () => {
  it('renders left, center, and right zones', () => {
    render(
      <LiveSessionTopBar
        left={<div data-testid="z-left" />}
        center={<div data-testid="z-center" />}
        right={<div data-testid="z-right" />}
      />,
    );
    expect(screen.getByTestId('z-left')).toBeTruthy();
    expect(screen.getByTestId('z-center')).toBeTruthy();
    expect(screen.getByTestId('z-right')).toBeTruthy();
  });

  it('omits optional zones when not provided', () => {
    render(<LiveSessionTopBar left={<div data-testid="z-left" />} />);
    expect(screen.getByTestId('z-left')).toBeTruthy();
    expect(screen.queryByTestId('z-center')).toBeNull();
    expect(screen.queryByTestId('z-right')).toBeNull();
  });

  it('applies className to the shell container', () => {
    const { container } = render(
      <LiveSessionTopBar left={<div />} className="test-top-bar-class" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain('test-top-bar-class');
  });
});
