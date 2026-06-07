import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useTaskBubbleUpStore } from '@/store/taskBubbleUpStore';
import { getStorefrontBrowserClient } from '../lib/supabase-browser';

type StorefrontAuthContextValue = {
  supabase: SupabaseClient | null;
  session: Session | null;
  userId: string | null;
  ready: boolean;
};

const StorefrontAuthContext = createContext<StorefrontAuthContextValue>({
  supabase: null,
  session: null,
  userId: null,
  ready: false,
});

export function useStorefrontAuth(): StorefrontAuthContextValue {
  return useContext(StorefrontAuthContext);
}

type Props = {
  children: ReactNode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export default function StorefrontAuthProvider({ children, supabaseUrl, supabaseAnonKey }: Props) {
  const [supabase] = useState(() =>
    getStorefrontBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey }),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;

    const syncBubbleAuth = (userId: string | null) => {
      const store = useTaskBubbleUpStore.getState();
      if (store.authUserId === userId) return;
      store.setAuthUserId(userId);
    };

    const ensureSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionData.session) {
        setSession(sessionData.session);
        syncBubbleAuth(sessionData.session.user.id);
        setReady(true);
        return;
      }

      const { data: anonData, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;

      if (error) {
        console.warn('[storefront] anonymous sign-in failed', error.message);
        setReady(true);
        return;
      }

      const next = anonData.session ?? null;
      setSession(next);
      syncBubbleAuth(next?.user.id ?? null);
      setReady(true);
    };

    void ensureSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      setSession((prev) => {
        if (prev?.user.id === nextUserId && prev?.access_token === nextSession?.access_token) {
          return prev;
        }
        return nextSession;
      });
      syncBubbleAuth(nextUserId);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({
      supabase,
      session,
      userId: session?.user.id ?? null,
      ready,
    }),
    [supabase, session, ready],
  );

  return <StorefrontAuthContext.Provider value={value}>{children}</StorefrontAuthContext.Provider>;
}
