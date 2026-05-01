'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  topLeftOverlay: ReactNode;
  topRightOverlay: ReactNode;
  setTopLeftOverlay: (node: ReactNode) => void;
  setTopRightOverlay: (node: ReactNode) => void;
};

const VideoOverlaySlotsContext = createContext<Value | null>(null);

export function VideoOverlaySlotsProvider({ children }: { children: ReactNode }) {
  const [topLeftOverlay, setTopLeftOverlay] = useState<ReactNode>(null);
  const [topRightOverlay, setTopRightOverlay] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({ topLeftOverlay, topRightOverlay, setTopLeftOverlay, setTopRightOverlay }),
    [topLeftOverlay, topRightOverlay],
  );
  return (
    <VideoOverlaySlotsContext.Provider value={value}>{children}</VideoOverlaySlotsContext.Provider>
  );
}

export function useVideoOverlaySlots(): Value {
  const ctx = useContext(VideoOverlaySlotsContext);
  if (!ctx) {
    throw new Error('useVideoOverlaySlots must be used within VideoOverlaySlotsProvider');
  }
  return ctx;
}

export function useVideoOverlaySlotsOptional(): Value | null {
  return useContext(VideoOverlaySlotsContext);
}
