import { describe, expect, it } from 'vitest';

import { classifyError } from './classify-error';

describe('classifyError', () => {
  it('maps classified POJO kinds including truncated', () => {
    expect(classifyError({ kind: 'http', status: 400, body: 'x' })).toBe('http');
    expect(classifyError({ kind: 'parse', body: 'x' })).toBe('parse');
    expect(classifyError({ kind: 'shape', detail: 'x' })).toBe('shape');
    expect(classifyError({ kind: 'timeout' })).toBe('timeout');
    expect(classifyError({ kind: 'auth', body: 'x' })).toBe('auth');
    expect(classifyError({ kind: 'truncated', body: '{"partial' })).toBe('truncated');
    expect(classifyError({ kind: 'self_attestation_mismatch' })).toBe('self_attestation_mismatch');
    expect(classifyError({ kind: 'cue_unanchored' })).toBe('cue_unanchored');
  });

  it('maps Coach strategy parser Error messages', () => {
    expect(classifyError(new Error('gemini_json_parse_failed'))).toBe('parse');
    expect(classifyError(new Error('gemini_empty_response'))).toBe('parse');
    expect(classifyError(new Error('gemini_invalid_json_shape'))).toBe('shape');
  });

  it('maps AbortError to timeout', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyError(err)).toBe('timeout');
  });

  it('defaults unknown errors to http', () => {
    expect(classifyError(new Error('something else'))).toBe('http');
    expect(classifyError({ kind: 'weird' })).toBe('http');
  });
});
