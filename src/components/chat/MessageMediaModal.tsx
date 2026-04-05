'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@utils/supabase/client';
import { MESSAGE_ATTACHMENTS_BUCKET } from '@/lib/message-storage';
import type { MessageAttachment } from '@/types/message-attachment';
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: MessageAttachment[];
  initialIndex: number;
};

export function MessageMediaModal({ open, onOpenChange, attachments, initialIndex }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = attachments[index];

  const loadUrl = useCallback(async () => {
    if (!current) {
      setSignedUrl(null);
      setPosterUrl(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    setPosterUrl(null);
    const supabase = createClient();

    if (current.kind === 'video' && current.thumb_path) {
      const { data: posterData } = await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .createSignedUrl(current.thumb_path, 3600);
      if (posterData?.signedUrl) setPosterUrl(posterData.signedUrl);
    }

    const { data, error: e } = await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .createSignedUrl(current.path, 3600);
    setLoading(false);
    if (e || !data?.signedUrl) {
      setError('Could not load file.');
      return;
    }
    setSignedUrl(data.signedUrl);
  }, [current]);

  useEffect(() => {
    void loadUrl();
  }, [loadUrl]);

  const openInNewTab = () => {
    if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer');
  };

  const isPdf =
    current?.mime_type === 'application/pdf' || current?.file_name.toLowerCase().endsWith('.pdf');

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Do not add `relative` here — it overrides `fixed` from DialogContent and breaks viewport centering.
          'flex max-h-[min(90dvh,100vh)] w-full max-w-[min(100vw-2rem,56rem)] flex-col gap-0 overflow-hidden p-0',
          current.kind === 'document' && !isPdf ? 'max-w-md' : '',
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12">
          <DialogTitle className="truncate text-left text-sm font-semibold">
            {current.file_name}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950/5 p-4">
          {posterUrl && current.kind === 'video' && loading && (
            <img
              src={posterUrl}
              alt=""
              className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full scale-105 object-contain opacity-40 blur-sm"
              aria-hidden
            />
          )}
          {loading && (
            <Loader2 className="relative z-10 h-10 w-10 animate-spin text-indigo-500" aria-hidden />
          )}
          {!loading && error && <p className="text-sm text-slate-600">{error}</p>}
          {!loading && !error && signedUrl && current.kind === 'image' && (
            <img
              src={signedUrl}
              alt={current.file_name}
              className="max-h-[min(75dvh,720px)] max-w-full object-contain"
            />
          )}
          {!loading && !error && signedUrl && current.kind === 'video' && (
            <video
              src={signedUrl}
              controls
              playsInline
              preload="metadata"
              poster={posterUrl ?? undefined}
              className="relative z-[1] max-h-[min(75dvh,720px)] max-w-full"
            />
          )}
          {!loading && !error && signedUrl && current.kind === 'document' && isPdf && (
            <iframe
              title={current.file_name}
              src={signedUrl}
              className="h-[min(75dvh,720px)] w-full min-h-[min(400px,50dvh)] rounded border border-slate-200 bg-white"
            />
          )}
          {!loading && !error && current.kind === 'document' && !isPdf && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <FileText className="h-16 w-16 text-slate-400" />
              <p className="text-sm text-slate-600">Open or download this file.</p>
              <button
                type="button"
                onClick={openInNewTab}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Open in new tab
              </button>
            </div>
          )}
        </div>

        {attachments.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous attachment"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md hover:bg-white"
              onClick={() => setIndex((i) => (i - 1 + attachments.length) % attachments.length)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next attachment"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md hover:bg-white"
              onClick={() => setIndex((i) => (i + 1) % attachments.length)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-500">
              {index + 1} / {attachments.length}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
