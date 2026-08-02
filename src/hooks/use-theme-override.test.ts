import { afterEach, describe, expect, it } from 'vitest';
import { categoryThemeOverrideStorageKey } from '@/lib/layout-collapse-keys';
import {
  migrateLegacyCategoryThemeOverride,
  readCategoryThemeOverride,
  resolveEffectiveCategory,
  writeCategoryThemeOverride,
} from '@/hooks/use-theme-override';

const LEGACY_GLOBAL_KEY = 'bb_category_theme_override';

afterEach(() => {
  localStorage.clear();
});

describe('resolveEffectiveCategory', () => {
  it('uses explicit override when not auto', () => {
    expect(resolveEffectiveCategory('kids', 'business')).toBe('kids');
    expect(resolveEffectiveCategory('community', null)).toBe('community');
  });

  it('uses workspace category when override is auto', () => {
    expect(resolveEffectiveCategory('auto', 'class')).toBe('class');
    expect(resolveEffectiveCategory('auto', 'COMMUNITY')).toBe('community');
  });

  it('falls back to business for invalid workspace category', () => {
    expect(resolveEffectiveCategory('auto', 'unknown-type')).toBe('business');
    expect(resolveEffectiveCategory('auto', null)).toBe('business');
    expect(resolveEffectiveCategory('auto', undefined)).toBe('business');
  });
});

describe('per-workspace category theme override storage', () => {
  it('stores independent values per workspaceId', () => {
    writeCategoryThemeOverride('ws-a', 'kids');
    writeCategoryThemeOverride('ws-b', 'fitness');
    expect(readCategoryThemeOverride('ws-a')).toBe('kids');
    expect(readCategoryThemeOverride('ws-b')).toBe('fitness');
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-a'))).toBe('kids');
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-b'))).toBe('fitness');
  });

  it('writing auto removes only that workspace key', () => {
    writeCategoryThemeOverride('ws-a', 'kids');
    writeCategoryThemeOverride('ws-b', 'fitness');
    writeCategoryThemeOverride('ws-a', 'auto');
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-a'))).toBeNull();
    expect(readCategoryThemeOverride('ws-a')).toBe('auto');
    expect(readCategoryThemeOverride('ws-b')).toBe('fitness');
  });

  it('read is pure: observes legacy without mutating storage', () => {
    localStorage.setItem(LEGACY_GLOBAL_KEY, 'community');
    expect(readCategoryThemeOverride('ws-first')).toBe('community');
    expect(localStorage.getItem(LEGACY_GLOBAL_KEY)).toBe('community');
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-first'))).toBeNull();
  });

  it('migrateLegacy copies global into first workspace then removes global', () => {
    localStorage.setItem(LEGACY_GLOBAL_KEY, 'community');
    migrateLegacyCategoryThemeOverride('ws-first');
    expect(localStorage.getItem(LEGACY_GLOBAL_KEY)).toBeNull();
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-first'))).toBe('community');
    expect(readCategoryThemeOverride('ws-second')).toBe('auto');
    expect(localStorage.getItem(categoryThemeOverrideStorageKey('ws-second'))).toBeNull();
  });

  it('migrateLegacy does not rewrite an existing per-workspace key', () => {
    writeCategoryThemeOverride('ws-a', 'kids');
    localStorage.setItem(LEGACY_GLOBAL_KEY, 'fitness');
    expect(readCategoryThemeOverride('ws-a')).toBe('kids');
    migrateLegacyCategoryThemeOverride('ws-a');
    expect(readCategoryThemeOverride('ws-a')).toBe('kids');
    expect(localStorage.getItem(LEGACY_GLOBAL_KEY)).toBeNull();
    expect(readCategoryThemeOverride('ws-b')).toBe('auto');
  });
});
