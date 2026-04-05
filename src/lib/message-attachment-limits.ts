import { classifyFileKind, inferMimeFromFileName } from '@/types/message-attachment';

/** Max bytes per file by kind (app enforcement; bucket may allow more). */
export const MAX_BYTES_IMAGE = 10 * 1024 * 1024;
export const MAX_BYTES_VIDEO = 32 * 1024 * 1024;
export const MAX_BYTES_DOCUMENT = 15 * 1024 * 1024;

export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_AGGREGATE_BYTES = 48 * 1024 * 1024;

const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const ALLOWED_DOCUMENT = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Hidden file input `accept` list aligned with validation. */
export const MESSAGE_ATTACHMENT_FILE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  ...ALLOWED_DOCUMENT,
].join(',');

function mimeAllowedForKind(kind: 'image' | 'video' | 'document', mime: string): boolean {
  const m = mime.toLowerCase();
  if (kind === 'image') return ALLOWED_IMAGE.has(m);
  if (kind === 'video') return ALLOWED_VIDEO.has(m);
  return ALLOWED_DOCUMENT.has(m) || m.startsWith('text/');
}

function maxBytesForKind(kind: 'image' | 'video' | 'document'): number {
  if (kind === 'image') return MAX_BYTES_IMAGE;
  if (kind === 'video') return MAX_BYTES_VIDEO;
  return MAX_BYTES_DOCUMENT;
}

export type ValidateAttachmentFilesResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

/**
 * Validates pending attachment files before creating a message row.
 * Call after `classifyFileKind` filtering if you only pass supported files.
 */
export function validateAttachmentFiles(files: File[]): ValidateAttachmentFilesResult {
  if (files.length === 0) return { ok: true, files: [] };
  if (files.length > MAX_FILES_PER_MESSAGE) {
    return {
      ok: false,
      message: `You can attach at most ${MAX_FILES_PER_MESSAGE} files per message.`,
    };
  }

  let aggregate = 0;
  const out: File[] = [];

  for (const file of files) {
    const kind = classifyFileKind(file);
    if (kind === 'unsupported') {
      return {
        ok: false,
        message: 'One or more files are not a supported image, video, or document type.',
      };
    }
    const mime =
      (file.type || '').toLowerCase() ||
      inferMimeFromFileName(file.name) ||
      'application/octet-stream';
    if (!mimeAllowedForKind(kind, mime)) {
      return {
        ok: false,
        message: 'One or more files use a type that is not allowed.',
      };
    }
    const maxB = maxBytesForKind(kind);
    if (file.size > maxB) {
      const mb = Math.round(maxB / (1024 * 1024));
      return {
        ok: false,
        message: `Each ${kind} must be at most ${mb} MB.`,
      };
    }
    aggregate += file.size;
    if (aggregate > MAX_AGGREGATE_BYTES) {
      return {
        ok: false,
        message: `Total attachment size must be at most ${Math.round(MAX_AGGREGATE_BYTES / (1024 * 1024))} MB.`,
      };
    }
    out.push(file);
  }

  return { ok: true, files: out };
}
