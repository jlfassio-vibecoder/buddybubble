'use client';

import { useEffect, useState } from 'react';

type Props = {
  publicationId: string | null;
  title: string;
  onClose: () => void;
};

export default function PublicVideoPlayerModal({ publicationId, title, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicationId) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/video-library-playback?publicationId=${encodeURIComponent(publicationId)}`,
        );
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          url?: string;
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok || !body?.url) {
          setError(body?.error?.trim() || 'Playback unavailable.');
          setLoading(false);
          return;
        }
        setUrl(body.url);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Playback unavailable.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicationId]);

  if (!publicationId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="bg-black p-2 sm:p-3">
          {loading ? (
            <p className="px-2 py-16 text-center text-sm text-white/70">Loading video…</p>
          ) : null}
          {error ? (
            <p className="px-2 py-16 text-center text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {url && !loading && !error ? (
            <video
              key={url}
              src={url}
              controls
              playsInline
              className="aspect-video w-full rounded-lg bg-black object-contain"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
