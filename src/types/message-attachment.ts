import type { Json } from '@/types/database';

/** Stored in `messages.attachments` JSONB (see docs/tdd-message-attachments.md). */
export type MessageAttachmentKind = 'image' | 'video' | 'document';

export type MessageAttachment = {
  id: string;
  kind: MessageAttachmentKind;
  /** Storage object path within the message-attachments bucket */
  path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  thumb_path?: string | null;
  width?: number | null;
  height?: number | null;
  duration_sec?: number | null;
};

/** When `File.type` is empty (common on iOS / some mobile pickers), infer from the name. */
const EXT_IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif']);
const EXT_VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v']);
const EXT_DOCUMENT = new Set([
  'pdf',
  'txt',
  'md',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
]);

function fileExtLower(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return '';
  return fileName.slice(i + 1).toLowerCase();
}

function classifyKindFromFileName(fileName: string): 'image' | 'video' | 'document' | null {
  const ext = fileExtLower(fileName);
  if (EXT_IMAGE.has(ext)) return 'image';
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_DOCUMENT.has(ext)) return 'document';
  return null;
}

/** Canonical MIME for validation / storage when `File.type` is missing (mobile). */
export function inferMimeFromFileName(fileName: string): string | null {
  const ext = fileExtLower(fileName);
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
  };
  return map[ext] ?? null;
}

export function classifyFileKind(file: File): 'image' | 'video' | 'document' | 'unsupported' {
  const t = file.type.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (
    t === 'application/pdf' ||
    t.startsWith('text/') ||
    t === 'application/msword' ||
    t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t === 'application/vnd.ms-excel' ||
    t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    t === 'application/vnd.ms-powerpoint' ||
    t === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'document';
  }
  if (t) return 'unsupported';
  const fromName = classifyKindFromFileName(file.name);
  return fromName ?? 'unsupported';
}

export function parseMessageAttachments(json: unknown): MessageAttachment[] {
  if (!Array.isArray(json)) return [];
  const out: MessageAttachment[] = [];
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : null;
    const kind = o.kind === 'image' || o.kind === 'video' || o.kind === 'document' ? o.kind : null;
    const path = typeof o.path === 'string' ? o.path : null;
    const file_name = typeof o.file_name === 'string' ? o.file_name : null;
    const mime_type = typeof o.mime_type === 'string' ? o.mime_type : null;
    const size_bytes =
      typeof o.size_bytes === 'number' && Number.isFinite(o.size_bytes) ? o.size_bytes : null;
    const uploaded_at = typeof o.uploaded_at === 'string' ? o.uploaded_at : null;
    if (!id || !kind || !path || !file_name || !mime_type || size_bytes === null || !uploaded_at)
      continue;
    const att: MessageAttachment = {
      id,
      kind,
      path,
      file_name,
      mime_type,
      size_bytes,
      uploaded_at,
    };
    if (o.thumb_path === null || typeof o.thumb_path === 'string')
      att.thumb_path = o.thumb_path ?? null;
    if (o.width === null || typeof o.width === 'number') att.width = o.width ?? null;
    if (o.height === null || typeof o.height === 'number') att.height = o.height ?? null;
    if (o.duration_sec === null || typeof o.duration_sec === 'number')
      att.duration_sec = o.duration_sec ?? null;
    out.push(att);
  }
  return out;
}

export function attachmentsToJson(arr: MessageAttachment[]): Json {
  return JSON.parse(JSON.stringify(arr)) as Json;
}
