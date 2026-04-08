/**
 * Server-only: workspace UUIDs permitted for marketing `/demo` + POST /api/demo/join.
 * Use DEMO_WORKSPACE_IDS (comma-separated) when the storefront passes `?workspace=` and it may
 * differ from NEXT_PUBLIC_DEMO_WORKSPACE_ID. If DEMO_WORKSPACE_IDS is unset, only
 * NEXT_PUBLIC_DEMO_WORKSPACE_ID is allowed (backward compatible).
 */
export function getAllowedDemoWorkspaceIds(): string[] {
  const raw = process.env.DEMO_WORKSPACE_IDS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID?.trim();
  return single ? [single] : [];
}
