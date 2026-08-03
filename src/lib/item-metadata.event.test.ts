import { describe, expect, it } from 'vitest';
import {
  asStringList,
  buildTaskMetadataPayload,
  combineEventEnds,
  isEventEndsBeforeOrEqualStart,
  metadataFieldsFromParsed,
  normalizeEventEnds,
  splitEventEnds,
} from '@/lib/item-metadata';

describe('asStringList', () => {
  it('trims and drops empties', () => {
    expect(asStringList([' Water ', '', 'Trail shoes', 3, null])).toEqual(['Water', 'Trail shoes']);
  });

  it('returns [] for non-arrays', () => {
    expect(asStringList(undefined)).toEqual([]);
    expect(asStringList('Water')).toEqual([]);
  });
});

describe('event metadata round-trip', () => {
  it('parses and builds bring/going/capacity/going_people', () => {
    const fields = metadataFieldsFromParsed({
      location: 'Trailhead',
      url: 'https://meet.example',
      bring: ['Water', 'Layers'],
      going: 12,
      capacity: 30,
      going_people: ['RS', 'TL', 'JF'],
    });

    expect(fields.eventBring).toEqual(['Water', 'Layers']);
    expect(fields.eventGoing).toBe('12');
    expect(fields.eventCapacity).toBe('30');
    expect(fields.eventGoingPeople).toEqual(['RS', 'TL', 'JF']);

    const built = buildTaskMetadataPayload('event', fields, {}) as Record<string, unknown>;
    expect(built.location).toBe('Trailhead');
    expect(built.url).toBe('https://meet.example');
    expect(built.bring).toEqual(['Water', 'Layers']);
    expect(built.going).toBe(12);
    expect(built.capacity).toBe(30);
    expect(built.going_people).toEqual(['RS', 'TL', 'JF']);
  });

  it('writes going 0 and omits empty bring/capacity/people', () => {
    const fields = metadataFieldsFromParsed({});
    fields.eventGoing = '0';
    const built = buildTaskMetadataPayload('event', fields, {
      bring: ['stale'],
      capacity: 99,
      going_people: ['X'],
    }) as Record<string, unknown>;
    expect(built.going).toBe(0);
    expect(built.bring).toBeUndefined();
    expect(built.capacity).toBeUndefined();
    expect(built.going_people).toBeUndefined();
  });

  it('round-trips metadata.ends', () => {
    const fields = metadataFieldsFromParsed({ ends: '2026-08-02T14:30:00Z' });
    expect(fields.eventEnds).toBe('2026-08-02T14:30');
    fields.eventEnds = '2026-08-03T09:15';
    const built = buildTaskMetadataPayload('event', fields, {}) as Record<string, unknown>;
    expect(built.ends).toBe('2026-08-03T09:15');
    expect(normalizeEventEnds('2026-08-01')).toBe('2026-08-01T00:00');
    expect(splitEventEnds('2026-08-01T10:30')).toEqual({ date: '2026-08-01', time: '10:30' });
    expect(combineEventEnds('2026-08-01', '11:00')).toBe('2026-08-01T11:00');
    expect(isEventEndsBeforeOrEqualStart('2026-08-01', '10:00', '2026-08-01T09:00')).toBe(true);
    expect(isEventEndsBeforeOrEqualStart('2026-08-01', '10:00', '2026-08-01T11:00')).toBe(false);
    expect(isEventEndsBeforeOrEqualStart('2026-08-01', '10:00', '')).toBe(false);
  });

  it('strips ends when switching away from event', () => {
    const fields = metadataFieldsFromParsed({ ends: '2026-08-02T14:30', location: 'Park' });
    const asTask = buildTaskMetadataPayload('task', fields, {
      ends: '2026-08-02T14:30',
      location: 'Park',
    }) as Record<string, unknown>;
    expect(asTask.ends).toBeUndefined();
    expect(asTask.location).toBeUndefined();
  });
});
