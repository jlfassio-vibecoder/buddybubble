'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useThemeOverride, type CategoryThemeOverride } from '@/hooks/use-theme-override';

const OPTIONS: { value: CategoryThemeOverride; label: string }[] = [
  { value: 'auto', label: 'Match Workspace (Default)' },
  { value: 'business', label: 'Business' },
  { value: 'kids', label: 'Kids & Family' },
  { value: 'community', label: 'Community' },
  { value: 'class', label: 'Class Cohort' },
  { value: 'fitness', label: 'Fitness' },
];

type Props = {
  className?: string;
  /** When true, hides the field label (parent may provide one) */
  hideLabel?: boolean;
};

export function CategoryThemeSelect({ className, hideLabel = false }: Props) {
  const { categoryOverride, setCategoryOverride, mounted } = useThemeOverride();

  if (!mounted) {
    return (
      <div className={cn('h-10 w-full animate-pulse rounded-lg bg-muted', className)} aria-hidden />
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {!hideLabel ? <Label htmlFor="bb-category-theme">Category Theme</Label> : null}
      <select
        id="bb-category-theme"
        value={categoryOverride}
        onChange={(e) => setCategoryOverride(e.target.value as CategoryThemeOverride)}
        className="w-full cursor-pointer rounded-lg border border-input bg-background py-2 pl-3 pr-8 text-sm text-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        aria-label="Category theme palette"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
