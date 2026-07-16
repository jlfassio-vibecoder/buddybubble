import { describe, expect, it } from 'vitest';
import {
  assembleRecorderBlob,
  pickMediaRecorderMimeType,
} from '@/lib/live-video/solo-studio-recorder';

describe('pickMediaRecorderMimeType', () => {
  it('prefers vp9+opus when supported', () => {
    const supported = new Set(['video/webm;codecs=vp9,opus', 'video/webm']);
    expect(pickMediaRecorderMimeType((m) => supported.has(m))).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to vp8 then plain webm', () => {
    expect(pickMediaRecorderMimeType((m) => m === 'video/webm;codecs=vp8,opus')).toBe(
      'video/webm;codecs=vp8,opus',
    );
    expect(pickMediaRecorderMimeType((m) => m === 'video/webm')).toBe('video/webm');
  });

  it('returns empty string when nothing is supported', () => {
    expect(pickMediaRecorderMimeType(() => false)).toBe('');
  });
});

describe('assembleRecorderBlob', () => {
  it('joins chunks with preferred mime type', () => {
    const a = new Blob(['aa'], { type: 'video/webm' });
    const b = new Blob(['bb'], { type: 'video/webm' });
    const out = assembleRecorderBlob([a, b], 'video/webm;codecs=vp9,opus');
    expect(out.type).toBe('video/webm;codecs=vp9,opus');
    expect(out.size).toBe(a.size + b.size);
  });

  it('falls back to first chunk type when mime empty', () => {
    const chunk = new Blob(['x'], { type: 'video/webm' });
    expect(assembleRecorderBlob([chunk], '').type).toBe('video/webm');
  });
});
