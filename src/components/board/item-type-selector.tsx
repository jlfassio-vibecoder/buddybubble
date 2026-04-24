'use client';

import { getItemTypeVisual, ITEM_TYPES_ORDER } from '@/lib/item-type-styles';
import type { ItemType } from '@/lib/item-types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ItemTypeSelectorProps = {
  value: ItemType;
  onChange: (next: ItemType) => void;
  disabled?: boolean;
  className?: string;
  /** When set, only these types appear (e.g. hide `class` for members). Order matches array order. */
  typesOrder?: ItemType[];
};

/** Segmented control for `tasks.item_type` (polymorphic smart table). */
export function ItemTypeSelector({
  value,
  onChange,
  disabled = false,
  className,
  typesOrder,
}: ItemTypeSelectorProps) {
  const order = typesOrder ?? ITEM_TYPES_ORDER;
  return (
    <div role="group" aria-label="Type" className={cn('flex flex-wrap gap-1.5', className)}>
      {order.map((v) => {
        const { Icon, label } = getItemTypeVisual(v);
        const selected = value === v;
        return (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={selected ? 'default' : 'outline'}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={label}
            className={cn('h-8 gap-1.5 px-2.5 font-medium', selected && 'shadow-sm')}
            onClick={() => onChange(v)}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 1)}</span>
          </Button>
        );
      })}
    </div>
  );
}
