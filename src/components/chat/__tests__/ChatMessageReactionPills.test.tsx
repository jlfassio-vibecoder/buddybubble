import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatMessageReactionPills } from '@/components/chat/ChatMessageReactionPills';

describe('ChatMessageReactionPills', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders pills with on state and toggles on click', () => {
    const onToggle = vi.fn();
    render(
      <ChatMessageReactionPills
        reactions={[
          { emoji: '👍', count: 2, reactedByMe: true },
          { emoji: '❤️', count: 1, reactedByMe: false },
        ]}
        canReact
        onToggleReaction={onToggle}
      />,
    );

    expect(screen.getByTestId('chat-message-reaction-pills')).toBeTruthy();
    const pills = screen.getAllByRole('button');
    const thumbs = pills.find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(thumbs).toBeTruthy();
    fireEvent.click(thumbs!);
    expect(onToggle).toHaveBeenCalledWith('👍');
  });

  it('shows add control when canReact', () => {
    render(<ChatMessageReactionPills reactions={[]} canReact onToggleReaction={vi.fn()} />);
    expect(screen.getByTestId('chat-message-reaction-add')).toBeTruthy();
  });

  it('hides entirely when no reactions and cannot react', () => {
    const { container } = render(
      <ChatMessageReactionPills reactions={[]} canReact={false} onToggleReaction={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
