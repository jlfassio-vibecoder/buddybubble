import { describe, expect, it } from 'vitest';
import { canAdvancePipelineStatus } from './recording-reconcile';

describe('canAdvancePipelineStatus (forward-only state machine)', () => {
  it('allows null -> recording (Phase 1 first write)', () => {
    expect(canAdvancePipelineStatus(null, 'recording')).toBe(true);
    expect(canAdvancePipelineStatus(undefined, 'recording')).toBe(true);
  });

  it('allows null -> uploading (defensive: webhook arrives before start completes)', () => {
    expect(canAdvancePipelineStatus(null, 'uploading')).toBe(true);
  });

  it('allows recording -> recording (idempotent re-fire)', () => {
    expect(canAdvancePipelineStatus('recording', 'recording')).toBe(true);
  });

  it('allows recording -> uploading (Phase 1 -> Phase 2)', () => {
    expect(canAdvancePipelineStatus('recording', 'uploading')).toBe(true);
  });

  it('allows uploading -> uploading (idempotent)', () => {
    expect(canAdvancePipelineStatus('uploading', 'uploading')).toBe(true);
  });

  it('rejects uploading -> recording (downgrade)', () => {
    expect(canAdvancePipelineStatus('uploading', 'recording')).toBe(false);
  });

  it('allows legacy processing -> uploading', () => {
    expect(canAdvancePipelineStatus('processing', 'uploading')).toBe(true);
  });

  it('rejects processing -> recording (no rollback to Phase 1)', () => {
    expect(canAdvancePipelineStatus('processing', 'recording')).toBe(false);
  });

  it('treats ready as terminal — no downgrade for any next status', () => {
    expect(canAdvancePipelineStatus('ready', 'recording')).toBe(false);
    expect(canAdvancePipelineStatus('ready', 'uploading')).toBe(false);
  });

  it('treats failed as terminal — no downgrade for any next status', () => {
    expect(canAdvancePipelineStatus('failed', 'recording')).toBe(false);
    expect(canAdvancePipelineStatus('failed', 'uploading')).toBe(false);
  });
});
