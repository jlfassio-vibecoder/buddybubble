import { describe, expect, it } from 'vitest';
import { classRecordingMemberCta } from './class-recording-metadata';
import type { ClassRecordingPayload } from '@/types/live-session-invite';

const base: ClassRecordingPayload = {
  type: 'class_recording',
  status: 'ready',
  provider: 'agora',
};

describe('classRecordingMemberCta', () => {
  it('returns queueOnly when no recording metadata exists', () => {
    expect(classRecordingMemberCta(null)).toBe('queueOnly');
  });

  it('maps Phase 1 (recording) to "recording"', () => {
    expect(classRecordingMemberCta({ ...base, status: 'recording' })).toBe('recording');
  });

  it('maps Phase 2 (uploading) to "uploading"', () => {
    expect(classRecordingMemberCta({ ...base, status: 'uploading' })).toBe('uploading');
  });

  it('maps legacy agora processing to "uploading" copy bucket', () => {
    expect(classRecordingMemberCta({ ...base, status: 'processing', provider: 'agora' })).toBe(
      'uploading',
    );
  });

  it('maps manual processing to its own editorProcessing CTA', () => {
    expect(classRecordingMemberCta({ ...base, status: 'processing', provider: 'manual' })).toBe(
      'editorProcessing',
    );
  });

  it('maps browser processing to uploading CTA (not editor)', () => {
    expect(classRecordingMemberCta({ ...base, status: 'processing', provider: 'browser' })).toBe(
      'uploading',
    );
  });

  it('maps Phase 3 (ready) to "ready"', () => {
    expect(classRecordingMemberCta({ ...base, status: 'ready' })).toBe('ready');
  });

  it('maps failed to "failed"', () => {
    expect(classRecordingMemberCta({ ...base, status: 'failed' })).toBe('failed');
  });
});
