import { describe, expect, it } from 'vitest';
import {
  isClassRecordingPipelineBusy,
  parseClassRecordingFromInstanceMetadata,
} from './live-session-invite';

describe('parseClassRecordingFromInstanceMetadata', () => {
  it('returns null when metadata is missing or wrong shape', () => {
    expect(parseClassRecordingFromInstanceMetadata(null)).toBeNull();
    expect(parseClassRecordingFromInstanceMetadata(undefined)).toBeNull();
    expect(parseClassRecordingFromInstanceMetadata('string')).toBeNull();
    expect(parseClassRecordingFromInstanceMetadata([])).toBeNull();
    expect(parseClassRecordingFromInstanceMetadata({})).toBeNull();
  });

  it('parses Phase 1: recording status', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'recording',
        provider: 'agora',
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    expect(parsed?.status).toBe('recording');
    expect(parsed?.provider).toBe('agora');
  });

  it('parses Phase 2: uploading status', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'uploading',
        provider: 'agora',
      },
    });
    expect(parsed?.status).toBe('uploading');
  });

  it('parses legacy processing (manual + agora) status', () => {
    const manual = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'processing',
        provider: 'manual',
      },
    });
    expect(manual?.status).toBe('processing');
    expect(manual?.provider).toBe('manual');

    const agora = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'processing',
        provider: 'agora',
      },
    });
    expect(agora?.status).toBe('processing');
  });

  it('parses Phase 3: ready with storagePath', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'ready',
        provider: 'agora',
        storagePath: 'ws/inst/file.mp4',
      },
    });
    expect(parsed?.status).toBe('ready');
    expect(parsed?.storagePath).toBe('ws/inst/file.mp4');
  });

  it('treats legacy row with only playbackUrl as ready', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        playbackUrl: 'https://cdn.example/video.mp4',
      },
    });
    expect(parsed?.status).toBe('ready');
    expect(parsed?.playbackUrl).toBe('https://cdn.example/video.mp4');
  });

  it('returns null for ready status without any path', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: { type: 'class_recording', status: 'ready' },
    });
    expect(parsed).toBeNull();
  });

  it('parses failed with optional errorMessage', () => {
    const parsed = parseClassRecordingFromInstanceMetadata({
      class_recording: {
        type: 'class_recording',
        status: 'failed',
        errorMessage: 'agora_error_level_5: ...',
      },
    });
    expect(parsed?.status).toBe('failed');
    expect(parsed?.errorMessage).toContain('agora_error_level_5');
  });
});

describe('isClassRecordingPipelineBusy', () => {
  it('returns true for recording, uploading, and legacy processing', () => {
    expect(isClassRecordingPipelineBusy('recording')).toBe(true);
    expect(isClassRecordingPipelineBusy('uploading')).toBe(true);
    expect(isClassRecordingPipelineBusy('processing')).toBe(true);
  });

  it('returns false for terminal states and missing values', () => {
    expect(isClassRecordingPipelineBusy('ready')).toBe(false);
    expect(isClassRecordingPipelineBusy('failed')).toBe(false);
    expect(isClassRecordingPipelineBusy(null)).toBe(false);
    expect(isClassRecordingPipelineBusy(undefined)).toBe(false);
  });
});
