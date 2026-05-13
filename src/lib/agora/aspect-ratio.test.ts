import { describe, expect, it } from 'vitest';
import { aspectRatioToCanvas, parseAspectRatio } from './aspect-ratio';

describe('parseAspectRatio', () => {
  it('returns 16:9 for explicit 16:9', () => {
    expect(parseAspectRatio('16:9')).toBe('16:9');
  });

  it('returns 9:16 and 1:1 when valid', () => {
    expect(parseAspectRatio('9:16')).toBe('9:16');
    expect(parseAspectRatio('1:1')).toBe('1:1');
  });

  it('defaults to 16:9 for missing or invalid', () => {
    expect(parseAspectRatio(undefined)).toBe('16:9');
    expect(parseAspectRatio(null)).toBe('16:9');
    expect(parseAspectRatio('4:3')).toBe('16:9');
    expect(parseAspectRatio(123)).toBe('16:9');
    expect(parseAspectRatio('')).toBe('16:9');
  });
});

describe('aspectRatioToCanvas', () => {
  it('maps each aspect to HD pixel canvas', () => {
    expect(aspectRatioToCanvas('16:9')).toEqual({ width: 1280, height: 720 });
    expect(aspectRatioToCanvas('9:16')).toEqual({ width: 720, height: 1280 });
    expect(aspectRatioToCanvas('1:1')).toEqual({ width: 720, height: 720 });
  });
});
