import { describe, expect, it } from 'vitest';
import {
  coerceWorkspaceCategory,
  resolveWorkspaceCategoryForRoute,
} from '@/lib/theme-engine/resolve-workspace-category';

describe('coerceWorkspaceCategory', () => {
  it('accepts registry keys case-insensitively', () => {
    expect(coerceWorkspaceCategory('fitness')).toBe('fitness');
    expect(coerceWorkspaceCategory('KIDS')).toBe('kids');
  });

  it('returns null for missing or unknown values', () => {
    expect(coerceWorkspaceCategory(null)).toBeNull();
    expect(coerceWorkspaceCategory(undefined)).toBeNull();
    expect(coerceWorkspaceCategory('unknown')).toBeNull();
  });
});

describe('resolveWorkspaceCategoryForRoute', () => {
  const kids = { id: 'ws-kids', category_type: 'kids' as const };
  const fitness = { id: 'ws-fit', category_type: 'fitness' as const };

  it('prefers list lookup by route id (store ahead of route)', () => {
    expect(
      resolveWorkspaceCategoryForRoute({
        workspaceId: 'ws-kids',
        userWorkspaces: [kids, fitness],
        activeWorkspace: fitness,
        initialCategoryType: 'business',
      }),
    ).toBe('kids');
  });

  it('prefers list lookup when route is ahead of activeWorkspace', () => {
    expect(
      resolveWorkspaceCategoryForRoute({
        workspaceId: 'ws-fit',
        userWorkspaces: [kids, fitness],
        activeWorkspace: kids,
        initialCategoryType: null,
      }),
    ).toBe('fitness');
  });

  it('falls back to matching activeWorkspace when list is empty', () => {
    expect(
      resolveWorkspaceCategoryForRoute({
        workspaceId: 'ws-fit',
        userWorkspaces: [],
        activeWorkspace: fitness,
        initialCategoryType: 'business',
      }),
    ).toBe('fitness');
  });

  it('uses SSR seed when list and active do not resolve', () => {
    expect(
      resolveWorkspaceCategoryForRoute({
        workspaceId: 'ws-new',
        userWorkspaces: [],
        activeWorkspace: null,
        initialCategoryType: 'community',
      }),
    ).toBe('community');
  });

  it('returns null on mismatch instead of inventing business', () => {
    expect(
      resolveWorkspaceCategoryForRoute({
        workspaceId: 'ws-other',
        userWorkspaces: [kids],
        activeWorkspace: kids,
        initialCategoryType: null,
      }),
    ).toBeNull();
  });
});
