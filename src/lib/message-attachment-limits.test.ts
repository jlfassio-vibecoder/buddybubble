import { describe, expect, it } from 'vitest';
import {
  MAX_FILES_PER_MESSAGE,
  MAX_BYTES_IMAGE,
  validateAttachmentFiles,
} from '@/lib/message-attachment-limits';

function img(name: string, size: number) {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

function pdf(name: string, size: number) {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

describe('validateAttachmentFiles', () => {
  it('accepts empty', () => {
    const r = validateAttachmentFiles([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files).toEqual([]);
  });

  it('rejects too many files', () => {
    const files = Array.from({ length: MAX_FILES_PER_MESSAGE + 1 }, (_, i) =>
      img(`f${i}.png`, 100),
    );
    const r = validateAttachmentFiles(files);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('at most');
  });

  it('rejects aggregate over cap', () => {
    const mb = 1024 * 1024;
    // Four PDFs under 15 MB each, sum over 48 MB aggregate cap
    const r = validateAttachmentFiles([
      pdf('a.pdf', 13 * mb),
      pdf('b.pdf', 13 * mb),
      pdf('c.pdf', 13 * mb),
      pdf('d.pdf', 13 * mb),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Total');
  });

  it('rejects oversized single image', () => {
    const r = validateAttachmentFiles([img('big.png', MAX_BYTES_IMAGE + 1)]);
    expect(r.ok).toBe(false);
  });

  it('accepts image with empty MIME when extension is known (iOS-style)', () => {
    const f = new File([new Uint8Array(100)], 'IMG_0001.PNG', { type: '' });
    const r = validateAttachmentFiles([f]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files).toHaveLength(1);
  });
});
