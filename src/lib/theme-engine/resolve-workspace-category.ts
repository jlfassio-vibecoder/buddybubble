import type { WorkspaceCategory } from '@/types/database';
import { THEME_REGISTRY } from '@/lib/theme-engine/registry';

export type WorkspaceCategorySource = {
  id: string;
  category_type: WorkspaceCategory | string | null | undefined;
};

/**
 * Normalize a raw category string to a registry key, or `null` when unknown.
 * Does **not** invent `'business'` for missing/mismatch — callers hold last-known.
 */
export function coerceWorkspaceCategory(
  category: WorkspaceCategory | string | null | undefined,
): WorkspaceCategory | null {
  if (category == null) return null;
  const c = String(category).trim().toLowerCase();
  if (c in THEME_REGISTRY) return c as WorkspaceCategory;
  return null;
}

/**
 * Resolve the route workspace's DB category for product + theme paint.
 *
 * Prefer list lookup by route id (survives store-ahead / route-ahead races),
 * then matching `activeWorkspace`, then SSR seed. Returns `null` when unknown
 * — never coerces ID mismatch to `'business'`.
 */
export function resolveWorkspaceCategoryForRoute(args: {
  workspaceId: string;
  userWorkspaces: WorkspaceCategorySource[];
  activeWorkspace: WorkspaceCategorySource | null | undefined;
  initialCategoryType?: WorkspaceCategory | string | null;
}): WorkspaceCategory | null {
  const { workspaceId, userWorkspaces, activeWorkspace, initialCategoryType } = args;
  const fromList = userWorkspaces.find((w) => w.id === workspaceId)?.category_type;
  const listCat = coerceWorkspaceCategory(fromList);
  if (listCat) return listCat;

  if (activeWorkspace?.id === workspaceId) {
    const activeCat = coerceWorkspaceCategory(activeWorkspace.category_type);
    if (activeCat) return activeCat;
  }

  return coerceWorkspaceCategory(initialCategoryType ?? null);
}
