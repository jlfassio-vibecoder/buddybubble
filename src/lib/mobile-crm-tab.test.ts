import { describe, expect, it } from 'vitest';
import { normalizeMobileTab } from './mobile-crm-tab';

describe('normalizeMobileTab', () => {
  it("returns 'board' for tab board", () => {
    expect(normalizeMobileTab('board')).toBe('board');
  });

  it("returns 'calendar' for tab calendar", () => {
    expect(normalizeMobileTab('calendar')).toBe('calendar');
  });

  it("defaults to 'chat' for null", () => {
    expect(normalizeMobileTab(null)).toBe('chat');
  });

  it("defaults to 'chat' for undefined when passed at runtime", () => {
    expect(normalizeMobileTab(undefined as unknown as string | null)).toBe('chat');
  });

  it("defaults to 'chat' for invalid or unknown strings", () => {
    expect(normalizeMobileTab('')).toBe('chat');
    expect(normalizeMobileTab('chat')).toBe('chat');
    expect(normalizeMobileTab('BOARD')).toBe('chat');
    expect(normalizeMobileTab('foo')).toBe('chat');
  });
});
