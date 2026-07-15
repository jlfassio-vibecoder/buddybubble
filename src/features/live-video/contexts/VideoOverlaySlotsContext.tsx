'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Agora RTC UID string (`String(remoteUser.uid)`). Use an object wrapper so this is not mistaken for a `useState` functional updater. */
export type RemoteRailBottomOverlaySlot = { render: (agoraUidStr: string) => ReactNode };

type Value = {
  topLeftOverlay: ReactNode;
  /** Top-center stage cue (e.g. Tabata exercise billboard). */
  topCenterOverlay: ReactNode;
  topRightOverlay: ReactNode;
  /** Main stage (host self-view or participant’s large host tile): bottom-aligned strip. */
  stageBottomOverlay: ReactNode;
  /** Participant PiP tile only: bottom-right on the local rail tile. */
  localRailPipOverlay: ReactNode;
  /** Each remote rail tile: bottom-right for that tile’s user only. */
  renderRemoteRailBottomOverlay: ((agoraUidStr: string) => ReactNode) | undefined;
  setTopLeftOverlay: (node: ReactNode) => void;
  setTopCenterOverlay: (node: ReactNode) => void;
  setTopRightOverlay: (node: ReactNode) => void;
  setStageBottomOverlay: (node: ReactNode) => void;
  setLocalRailPipOverlay: (node: ReactNode) => void;
  setRemoteRailBottomOverlaySlot: (slot: RemoteRailBottomOverlaySlot | null) => void;
};

const VideoOverlaySlotsContext = createContext<Value | null>(null);

export function VideoOverlaySlotsProvider({ children }: { children: ReactNode }) {
  const [topLeftOverlay, setTopLeftOverlay] = useState<ReactNode>(null);
  const [topCenterOverlay, setTopCenterOverlay] = useState<ReactNode>(null);
  const [topRightOverlay, setTopRightOverlay] = useState<ReactNode>(null);
  const [stageBottomOverlay, setStageBottomOverlay] = useState<ReactNode>(null);
  const [localRailPipOverlay, setLocalRailPipOverlay] = useState<ReactNode>(null);
  const [remoteRailBottomOverlaySlot, setRemoteRailBottomOverlaySlot] =
    useState<RemoteRailBottomOverlaySlot | null>(null);
  const value = useMemo(
    () => ({
      topLeftOverlay,
      topCenterOverlay,
      topRightOverlay,
      stageBottomOverlay,
      localRailPipOverlay,
      renderRemoteRailBottomOverlay: remoteRailBottomOverlaySlot?.render,
      setTopLeftOverlay,
      setTopCenterOverlay,
      setTopRightOverlay,
      setStageBottomOverlay,
      setLocalRailPipOverlay,
      setRemoteRailBottomOverlaySlot,
    }),
    [
      topLeftOverlay,
      topCenterOverlay,
      topRightOverlay,
      stageBottomOverlay,
      localRailPipOverlay,
      remoteRailBottomOverlaySlot,
    ],
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
