import { describe, it, expect } from 'vitest';
import { getUserColor } from './user-presence-colors';

describe('getUserColor', () => {
  it('returns the same hex for the same user id', () => {
    expect(getUserColor('550e8400-e29b-41d4-a716-446655440000')).toBe(
      getUserColor('550e8400-e29b-41d4-a716-446655440000'),
    );
  });

  it('returns a string from the palette', () => {
    const c = getUserColor('user-a');
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
