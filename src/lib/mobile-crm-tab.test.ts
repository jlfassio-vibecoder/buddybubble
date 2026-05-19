import { describe, expect, it } from 'vitest';
import { normalizeMobileNav, normalizeMobileTab } from '@/lib/mobile-crm-tab';

describe('normalizeMobileTab', () => {
  it('defaults to chat', () => {
    expect(normalizeMobileTab(null)).toBe('chat');
    expect(normalizeMobileTab('invalid')).toBe('chat');
  });

  it('accepts board and calendar', () => {
    expect(normalizeMobileTab('board')).toBe('board');
    expect(normalizeMobileTab('calendar')).toBe('calendar');
  });
});

describe('normalizeMobileNav', () => {
  it('is open only when nav=open', () => {
    expect(normalizeMobileNav('open')).toBe(true);
    expect(normalizeMobileNav(null)).toBe(false);
    expect(normalizeMobileNav('closed')).toBe(false);
  });
});
