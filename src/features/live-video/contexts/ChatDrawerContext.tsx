'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  chatDrawerLeaderboard: ReactNode;
  setChatDrawerLeaderboard: (node: ReactNode) => void;
};

const ChatDrawerContext = createContext<Value | null>(null);

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [chatDrawerLeaderboard, setChatDrawerLeaderboard] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({ chatDrawerLeaderboard, setChatDrawerLeaderboard }),
    [chatDrawerLeaderboard],
  );
  return <ChatDrawerContext.Provider value={value}>{children}</ChatDrawerContext.Provider>;
}

export function useChatDrawer(): Value {
  const ctx = useContext(ChatDrawerContext);
  if (!ctx) {
    throw new Error('useChatDrawer must be used within ChatDrawerProvider');
  }
  return ctx;
}

export function useChatDrawerOptional(): Value | null {
  return useContext(ChatDrawerContext);
}
