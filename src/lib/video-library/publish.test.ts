import { describe, expect, it } from 'vitest';
import { isRecordingReadyToPublish } from './publish';
import type { ClassRecordingPayload } from '@/types/live-session-invite';

const readyBase: ClassRecordingPayload = {
  type: 'class_recording',
  status: 'ready',
  provider: 'browser',
  storagePath: 'ws/ci/studio-capture.webm',
};

describe('isRecordingReadyToPublish', () => {
  it('returns false for null', () => {
    expect(isRecordingReadyToPublish(null)).toBe(false);
  });

  it('returns false when status is not ready', () => {
    expect(isRecordingReadyToPublish({ ...readyBase, status: 'uploading' })).toBe(false);
  });

  it('returns false when ready but missing path and url', () => {
    expect(
      isRecordingReadyToPublish({
        type: 'class_recording',
        status: 'ready',
      }),
    ).toBe(false);
  });

  it('returns true when ready with storagePath', () => {
    expect(isRecordingReadyToPublish(readyBase)).toBe(true);
  });

  it('returns true when ready with playbackUrl only', () => {
    expect(
      isRecordingReadyToPublish({
        type: 'class_recording',
        status: 'ready',
        playbackUrl: 'https://example.com/v.webm',
      }),
    ).toBe(true);
  });
});
