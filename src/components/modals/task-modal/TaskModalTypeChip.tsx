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
  /** Restrict which types can be chosen (e.g. hide `class` for non-trainers). */
  typesOrder?: ItemType[];
};

/** `.tm-eyebrow-pill` + `.tm-typepop` — compact type chip that opens a "Change type" picker. */
export function TaskModalTypeChip({
  itemType,
  onItemTypeChange,
  disabled = false,
  typesOrder,
}: TaskModalTypeChipProps) {
  const order = typesOrder ?? ITEM_TYPES_ORDER;
  const active = getItemTypeVisual(itemType);
  const ActiveIcon = active.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full border pl-2.5 pr-2 text-[11.5px] font-bold transition-[filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-60',
          active.typeChip,
        )}
      >
        <ActiveIcon className="size-3.5 shrink-0" aria-hidden />
        {active.label}
        <ChevronDown className="size-3 shrink-0 opacity-65" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[252px] rounded-2xl p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Change type
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={itemType}
            onValueChange={(v) => onItemTypeChange(v as ItemType)}
          >
            {order.map((t) => {
              const visual = getItemTypeVisual(t);
              const Icon = visual.Icon;
              return (
                <DropdownMenuRadioItem
                  key={t}
                  value={t}
                  className="gap-2.5 rounded-lg py-1.5 pr-8 pl-2 text-[13.5px] font-semibold"
                >
                  <span
                    className={cn(
                      'flex size-[30px] shrink-0 items-center justify-center rounded-lg',
                      visual.surface,
                      visual.iconText,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
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
