import { describe, expect, it } from 'vitest';
import { buildTaskMetadataPayload, metadataFieldsFromParsed } from '@/lib/item-metadata';

describe('experience metadata round-trip', () => {
  it('parses and builds highlights/includes/good_for and logistics', () => {
    const fields = metadataFieldsFromParsed({
      season: 'Summer 2026',
      end_date: '2026-08-31',
      highlights: ['Sunrise views', 'Guided mobility'],
      includes: ['Certified guide', 'Recovery snack'],
      good_for: ['All levels', 'Outdoors'],
      location: 'Eagle Ridge Trailhead',
      duration_min: 150,
      price: '$28 · members $20',
      group_min: 4,
      group_max: 8,
    });

    expect(fields.experienceHighlights).toEqual(['Sunrise views', 'Guided mobility']);
    expect(fields.experienceIncludes).toEqual(['Certified guide', 'Recovery snack']);
    expect(fields.experienceGoodFor).toEqual(['All levels', 'Outdoors']);
    expect(fields.experienceLocation).toBe('Eagle Ridge Trailhead');
    expect(fields.experienceDurationMin).toBe('150');
    expect(fields.experiencePrice).toBe('$28 · members $20');
    expect(fields.experienceGroupMin).toBe('4');
    expect(fields.experienceGroupMax).toBe('8');

    const built = buildTaskMetadataPayload('experience', fields, {}) as Record<string, unknown>;
    expect(built.season).toBe('Summer 2026');
    expect(built.end_date).toBe('2026-08-31');
    expect(built.highlights).toEqual(['Sunrise views', 'Guided mobility']);
    expect(built.includes).toEqual(['Certified guide', 'Recovery snack']);
    expect(built.good_for).toEqual(['All levels', 'Outdoors']);
    expect(built.location).toBe('Eagle Ridge Trailhead');
    expect(built.duration_min).toBe(150);
    expect(built.price).toBe('$28 · members $20');
    expect(built.group_min).toBe(4);
    expect(built.group_max).toBe(8);
  });

  it('omits empty lists and optional logistics', () => {
    const fields = metadataFieldsFromParsed({});
    const built = buildTaskMetadataPayload('experience', fields, {
      highlights: ['stale'],
      includes: ['stale'],
      good_for: ['stale'],
      location: 'stale',
      duration_min: 99,
      price: 'stale',
      group_min: 1,
      group_max: 2,
    }) as Record<string, unknown>;
    expect(built.highlights).toBeUndefined();
    expect(built.includes).toBeUndefined();
    expect(built.good_for).toBeUndefined();
    expect(built.location).toBeUndefined();
    expect(built.duration_min).toBeUndefined();
    expect(built.price).toBeUndefined();
    expect(built.group_min).toBeUndefined();
    expect(built.group_max).toBeUndefined();
  });
});
