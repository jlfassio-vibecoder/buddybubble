import { describe, expect, it } from 'vitest';
import type { Json } from '@/types/database';
import {
  applyClassOfferingPhaseN,
  emptyClassOfferingPhaseN,
  parseClassOfferingPhaseN,
  showsJoinLinkForFormat,
  showsLocationForFormat,
  type ClassOfferingPhaseNFields,
} from '@/lib/fitness/class-offering-metadata';

describe('showsLocationForFormat / showsJoinLinkForFormat', () => {
  it('shows location for unset, in_person, hybrid', () => {
    expect(showsLocationForFormat('')).toBe(true);
    expect(showsLocationForFormat('in_person')).toBe(true);
    expect(showsLocationForFormat('hybrid')).toBe(true);
    expect(showsLocationForFormat('online')).toBe(false);
  });

  it('shows join link for online and hybrid only', () => {
    expect(showsJoinLinkForFormat('online')).toBe(true);
    expect(showsJoinLinkForFormat('hybrid')).toBe(true);
    expect(showsJoinLinkForFormat('in_person')).toBe(false);
    expect(showsJoinLinkForFormat('')).toBe(false);
  });
});

describe('parseClassOfferingPhaseN', () => {
  it('returns empty defaults for non-objects', () => {
    expect(parseClassOfferingPhaseN(null)).toEqual(emptyClassOfferingPhaseN());
    expect(parseClassOfferingPhaseN('x')).toEqual(emptyClassOfferingPhaseN());
  });

  it('parses closed enums and ignores unknowns', () => {
    const parsed = parseClassOfferingPhaseN({
      format: 'hybrid',
      join_link: 'https://example.com/join',
      recurring: 'weekly',
      days: ['Mon', 'bogus', 'Wed', 'Mon'],
      price: '$25',
      reminders: ['1 hour before', 'never', 'At start'],
      fitness: { intensity: 'high' },
    });
    expect(parsed).toEqual({
      format: 'hybrid',
      join_link: 'https://example.com/join',
      recurring: 'weekly',
      days: ['Mon', 'Wed'],
      price: '$25',
      reminders: ['1 hour before', 'At start'],
    });
  });

  it('falls back invalid format/recurring', () => {
    const parsed = parseClassOfferingPhaseN({
      format: 'teleport',
      recurring: 'yearly',
    });
    expect(parsed.format).toBe('');
    expect(parsed.recurring).toBe('none');
  });
});

describe('applyClassOfferingPhaseN', () => {
  const weekly: ClassOfferingPhaseNFields = {
    format: 'hybrid',
    join_link: '  https://meet.example/x  ',
    recurring: 'weekly',
    days: ['Tue', 'Thu'],
    price: ' $0 · members ',
    reminders: ['1 day before', '15 min before'],
  };

  it('round-trips and preserves fitness / unknown keys', () => {
    const base = {
      fitness: { intensity: 'moderate', targeted_focus: ['core'] },
      custom_flag: true,
    } as Json;
    const next = applyClassOfferingPhaseN(base, weekly);
    expect(next).toMatchObject({
      fitness: { intensity: 'moderate', targeted_focus: ['core'] },
      custom_flag: true,
      format: 'hybrid',
      join_link: 'https://meet.example/x',
      recurring: 'weekly',
      days: ['Tue', 'Thu'],
      price: '$0 · members',
      reminders: ['1 day before', '15 min before'],
    });
    expect(parseClassOfferingPhaseN(next)).toEqual({
      format: 'hybrid',
      join_link: 'https://meet.example/x',
      recurring: 'weekly',
      days: ['Tue', 'Thu'],
      price: '$0 · members',
      reminders: ['1 day before', '15 min before'],
    });
  });

  it('strips days when not weekly and join_link when not online/hybrid', () => {
    const base = {
      days: ['Mon'],
      join_link: 'https://old.example',
      format: 'hybrid',
    } as Json;
    const next = applyClassOfferingPhaseN(base, {
      format: 'in_person',
      join_link: 'https://should-drop.example',
      recurring: 'daily',
      days: ['Fri'],
      price: '',
      reminders: [],
    });
    expect(next).toEqual({ format: 'in_person', recurring: 'daily' });
  });

  it('omits empty format/price/reminders and empty weekly days', () => {
    const next = applyClassOfferingPhaseN(
      { price: 'old', reminders: ['At start'], days: ['Sun'] } as Json,
      {
        format: '',
        join_link: '',
        recurring: 'weekly',
        days: [],
        price: '  ',
        reminders: [],
      },
    );
    expect(next).toEqual({ recurring: 'weekly' });
  });
});
