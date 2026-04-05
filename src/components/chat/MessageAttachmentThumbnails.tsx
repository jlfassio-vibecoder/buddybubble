'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { MESSAGE_ATTACHMENTS_BUCKET } from '@/lib/message-storage';
import { createSignedUrlForMessageImageThumb } from '@/lib/message-image-url';
import type { MessageAttachment } from '@/types/message-attachment';
import { FileText, Loader2, Film, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  attachments: MessageAttachment[];
  onOpenAttachment: (index: number) => void;
  className?: string;
};

function thumbLabel(att: MessageAttachment): string {
  return `${att.kind}: ${att.file_name}`;
}

function isPdfDocument(att: MessageAttachment): boolean {
  return (
    att.kind === 'document' &&
    (att.mime_type === 'application/pdf' || att.file_name.toLowerCase().endsWith('.pdf'))
  );
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MessageAttachmentThumbnails({ attachments, onOpenAttachment, className }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const next: Record<string, string> = {};
      for (const att of attachments) {
        if (att.kind === 'image') {
          const path = att.thumb_path ?? att.path;
          const signed = await createSignedUrlForMessageImageThumb(
            supabase,
            MESSAGE_ATTACHMENTS_BUCKET,
            path,
          );
          if (signed) next[att.id] = signed;
        } else if (att.kind === 'video') {
          if (att.thumb_path) {
            const { data } = await supabase.storage
              .from(MESSAGE_ATTACHMENTS_BUCKET)
              .createSignedUrl(att.thumb_path, 3600);
            if (data?.signedUrl) next[att.id] = data.signedUrl;
          }
        } else if (att.kind === 'document' && isPdfDocument(att) && att.thumb_path) {
          const { data } = await supabase.storage
            .from(MESSAGE_ATTACHMENTS_BUCKET)
            .createSignedUrl(att.thumb_path, 3600);
          if (data?.signedUrl) next[att.id] = data.signedUrl;
        }
      }
      if (!cancelled) setUrls(next);
    }
    if (attachments.length > 0) void load();
    else setUrls({});
    return () => {
      cancelled = true;
    };
  }, [attachments]);

  if (attachments.length === 0) return null;

  return (
    <div className={cn('mt-2 flex flex-wrap gap-2', className)}>
      {attachments.map((att, idx) => (
        <button
          key={att.id}
          type="button"
          onClick={() => onOpenAttachment(idx)}
          className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          aria-label={thumbLabel(att)}
        >
          {att.kind === 'image' && (
            <>
              {urls[att.id] ? (
                <img
                  src={urls[att.id]}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
                </div>
              )}
            </>
          )}
          {att.kind === 'video' && (
            <>
              {urls[att.id] ? (
                <>
                  <img
                    src={urls[att.id]}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25"
                    aria-hidden
                  >
                    <Play className="h-8 w-8 text-white drop-shadow-md" fill="currentColor" />
                  </span>
                  {formatDuration(att.duration_sec) ? (
                    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                      {formatDuration(att.duration_sec)}
                    </span>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-200">
                  <Film className="h-6 w-6 text-slate-500" />
                  <span className="max-w-full truncate px-1 text-[9px] text-slate-600">
                    {att.file_name}
                  </span>
                </div>
              )}
            </>
          )}
          {att.kind === 'document' && (
            <>
              {isPdfDocument(att) && urls[att.id] ? (
                <img
                  src={urls[att.id]}
                  alt=""
                  className="h-full w-full object-cover object-top"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
                  <FileText className="h-7 w-7 text-indigo-500" />
                  <span className="max-w-full truncate text-[9px] font-medium text-slate-700">
                    {att.file_name}
                  </span>
                </div>
              )}
              {isPdfDocument(att) && urls[att.id] ? (
                <span className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-center text-[9px] font-medium text-white">
                  {att.file_name}
                </span>
              ) : null}
            </>
          )}
        </button>
      ))}
    </div>
  );
}
