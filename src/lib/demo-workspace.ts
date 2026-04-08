/** Public demo workspace UUID (anon users are redirected here from `/demo`). */
export function getDemoWorkspaceId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID?.trim();
  return id || undefined;
}
