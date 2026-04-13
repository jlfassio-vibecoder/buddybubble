'use client';

/**
 * AnalyticsProvider
 *
 * Fires `session_start` once per browser session and `page_view` on every
 * pathname change. Wrap the workspace layout client tree with this component.
 *
 * Relies on `track()` from the client analytics module — events are batched
 * and flushed every 2 seconds (or immediately on tab close).
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/client';

interface Props {
  workspaceId?: string | null;
  userId?: string | null;
  children: React.ReactNode;
}

export function AnalyticsProvider({ workspaceId, userId, children }: Props) {
  const pathname = usePathname();
  const sessionFiredRef = useRef(false);

  // Fire session_start once per browser session
  useEffect(() => {
    if (sessionFiredRef.current) return;
    sessionFiredRef.current = true;
    track('session_start', { workspace_id: workspaceId, user_id: userId });
  }, [workspaceId, userId]);

  // Fire page_view on every pathname change
  useEffect(() => {
    track('page_view', {
      workspace_id: workspaceId,
      user_id: userId,
      path: pathname,
    });
  }, [pathname, workspaceId, userId]);

  return <>{children}</>;
}
