import { describe, expect, it } from 'vitest';
import { posterCanvasDimensions, VIDEO_POSTER_MAX_WIDTH } from '@/lib/video-poster';

describe('posterCanvasDimensions', () => {
  it('scales down when wider than max', () => {
    const d = posterCanvasDimensions(1920, 1080, VIDEO_POSTER_MAX_WIDTH);
    expect(d.width).toBe(VIDEO_POSTER_MAX_WIDTH);
    expect(d.height).toBe(360);
  });

  it('preserves size when under max width', () => {
    const d = posterCanvasDimensions(320, 240, VIDEO_POSTER_MAX_WIDTH);
    expect(d.width).toBe(320);
    expect(d.height).toBe(240);
  });

  it('uses default aspect when dimensions invalid', () => {
    const d = posterCanvasDimensions(0, 0, 640);
    expect(d.width).toBe(640);
    expect(d.height).toBe(360);
  });
});
