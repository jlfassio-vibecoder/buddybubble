import { describe, expect, it } from 'vitest';
import { buildMessageAttachmentObjectPath } from '@/lib/message-storage';
import {
  classifyFileKind,
  inferMimeFromFileName,
  parseMessageAttachments,
} from '@/types/message-attachment';

describe('buildMessageAttachmentObjectPath', () => {
  it('sanitizes unsafe characters in file name', () => {
    const p = buildMessageAttachmentObjectPath('ws-1', 'msg-2', 'my file (1).pdf');
    expect(p.startsWith('ws-1/msg-2/')).toBe(true);
    expect(p).toContain('my_file__1_.pdf');
    expect(p).not.toContain(' ');
    expect(p).not.toContain('(');
  });
});

describe('classifyFileKind (empty MIME — mobile pickers)', () => {
  it('classifies image from extension when type is empty', () => {
    const f = new File([new Uint8Array(10)], 'photo.png', { type: '' });
    expect(classifyFileKind(f)).toBe('image');
  });

  it('classifies HEIC from extension when type is empty', () => {
    const f = new File([new Uint8Array(10)], 'IMG.HEIC', { type: '' });
    expect(classifyFileKind(f)).toBe('image');
  });

  it('infers MIME for validation', () => {
    expect(inferMimeFromFileName('x.PNG')).toBe('image/png');
    expect(inferMimeFromFileName('clip.MOV')).toBe('video/quicktime');
  });
});

describe('parseMessageAttachments', () => {
  it('returns empty for non-array', () => {
    expect(parseMessageAttachments(null)).toEqual([]);
    expect(parseMessageAttachments({})).toEqual([]);
  });

  it('parses valid items', () => {
    const j = [
      {
        id: 'a',
        kind: 'image' as const,
        path: 'w/m/f',
        file_name: 'x.png',
        mime_type: 'image/png',
        size_bytes: 10,
        uploaded_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const out = parseMessageAttachments(j);
    expect(out).toHaveLength(1);
    expect(out[0]?.file_name).toBe('x.png');
  });

  it('skips invalid items', () => {
    const j = [{ id: 'x' }];
    expect(parseMessageAttachments(j)).toEqual([]);
  });
});
