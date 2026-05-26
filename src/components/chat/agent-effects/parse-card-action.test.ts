import { describe, expect, it } from 'vitest';

import { parseCardActionFromMetadata } from './parse-card-action';

describe('parseCardActionFromMetadata', () => {
  it('returns null for null, undefined, primitives, and arrays', () => {
    expect(parseCardActionFromMetadata(null)).toBeNull();
    expect(parseCardActionFromMetadata(undefined)).toBeNull();
    expect(parseCardActionFromMetadata('trigger_generation')).toBeNull();
    expect(parseCardActionFromMetadata([])).toBeNull();
  });

  it('returns null for missing or wrong v', () => {
    expect(parseCardActionFromMetadata({ kind: 'trigger_generation' })).toBeNull();
    expect(parseCardActionFromMetadata({ v: 2, kind: 'trigger_generation' })).toBeNull();
  });

  it('returns null for missing or unknown kind', () => {
    expect(parseCardActionFromMetadata({ v: 1 })).toBeNull();
    expect(parseCardActionFromMetadata({ v: 1, kind: 'reset_intake' })).toBeNull();
  });

  it('returns parsed object for valid trigger_generation payload', () => {
    expect(parseCardActionFromMetadata({ v: 1, kind: 'trigger_generation' })).toEqual({
      v: 1,
      kind: 'trigger_generation',
    });
  });

  it('returns parsed object for regenerate_from_outline payload', () => {
    expect(parseCardActionFromMetadata({ v: 1, kind: 'regenerate_from_outline' })).toEqual({
      v: 1,
      kind: 'regenerate_from_outline',
    });
  });
});
