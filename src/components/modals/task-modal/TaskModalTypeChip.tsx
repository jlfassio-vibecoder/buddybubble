'use client';

import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getItemTypeVisual, ITEM_TYPES_ORDER } from '@/lib/item-type-styles';
import type { ItemType } from '@/lib/item-types';
import { cn } from '@/lib/utils';

export type TaskModalTypeChipProps = {
  itemType: ItemType;
  onItemTypeChange: (next: ItemType) => void;
  disabled?: boolean;
  /** Types that appear but cannot be selected (e.g. `class` for non-trainers). */
  disabledTypes?: ItemType[];
  /** Defaults to full schema order (all 9 types). */
  typesOrder?: ItemType[];
};

/**
 * Design `.tm-eyebrow-pill` + `.tm-typepop` — type chip opens a Change-type menu.
 */
export function TaskModalTypeChip({
  itemType,
  onItemTypeChange,
  disabled = false,
  disabledTypes = [],
  typesOrder,
}: TaskModalTypeChipProps) {
  const order = typesOrder ?? ITEM_TYPES_ORDER;
  const active = getItemTypeVisual(itemType);
  const ActiveIcon = active.Icon;
  const disabledSet = new Set(disabledTypes);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Card type: ${active.label}. Change type`}
        className={cn(
          // `.tm-eyebrow-pill` — h 28, pad 0 8 0 11, gap 6, tracking 0.02em
          'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border pl-[11px] pr-2 text-[11.5px] font-bold tracking-[0.02em] transition-[filter] hover:brightness-110',
          'outline-none disabled:pointer-events-none disabled:opacity-60',
          'data-popup-open:outline data-popup-open:outline-2 data-popup-open:outline-offset-[3px] data-popup-open:outline-current',
          active.typeChip,
        )}
      >
        <ActiveIcon className="size-[13px] shrink-0" strokeWidth={2.2} aria-hidden />
        {active.label}
        <ChevronDown className="size-3 shrink-0 opacity-65" strokeWidth={2.4} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={8}
        className={cn(
          // `.tm-typepop` — 252px, radius-2xl (~18px), pad 7, deep shadow
          'w-[252px] rounded-[var(--radius-2xl)] border border-border bg-popover p-[7px] text-popover-foreground',
          'shadow-[0_22px_55px_-14px_rgba(0,0,0,0.75)]',
        )}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
            Change type
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={itemType}
            onValueChange={(v) => {
              const next = v as ItemType;
              if (disabledSet.has(next)) return;
              onItemTypeChange(next);
            }}
          >
            {order.map((t) => {
              const visual = getItemTypeVisual(t);
              const Icon = visual.Icon;
              const isDisabled = disabledSet.has(t);
              const isActive = t === itemType;
              return (
                <DropdownMenuRadioItem
                  key={t}
                  value={t}
                  disabled={isDisabled}
                  className={cn(
                    // `.tm-typeopt` — pad 7/8, gap 11, radius 10
                    'gap-[11px] rounded-[10px] px-2 py-[7px] text-[13.5px] font-semibold',
                    isActive && 'bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-[30px] shrink-0 items-center justify-center rounded-[9px]',
                      visual.surface,
                      visual.iconText,
                    )}
                  >
                    <Icon className="size-[15px]" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="flex-1">{visual.label}</span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
