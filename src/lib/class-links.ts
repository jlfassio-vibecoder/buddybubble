import { getCanonicalOrigin } from '@/lib/app-url';

export const JOIN_LIVE_CLASS_PARAM = 'join_live_class';

export function getClassUrl(workspaceId: string, instanceId: string): string {
  const origin = getCanonicalOrigin();
  return `${origin}/app/${workspaceId}?${JOIN_LIVE_CLASS_PARAM}=${instanceId}`;
}
