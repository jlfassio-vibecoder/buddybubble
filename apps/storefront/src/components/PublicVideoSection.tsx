'use client';

import { useMemo, useState } from 'react';
import type { PublicVideoCardData } from '../lib/public-video-types';
import PublicVideoCard from './PublicVideoCard';
import PublicVideoPlayerModal from './PublicVideoPlayerModal';

type Props = {
  videos: PublicVideoCardData[];
};

export default function PublicVideoSection({ videos }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTitle = useMemo(() => {
    if (!activeId) return '';
    return videos.find((v) => v.publicationId === activeId)?.title ?? 'Video';
  }, [activeId, videos]);

  if (videos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <PublicVideoCard
            key={video.publicationId}
            video={video}
            onWatch={(id) => setActiveId(id)}
          />
        ))}
      </div>
      <PublicVideoPlayerModal
        publicationId={activeId}
        title={activeTitle}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}
