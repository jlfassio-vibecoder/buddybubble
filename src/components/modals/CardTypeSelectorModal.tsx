'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ItemType } from '@/types/database';
import { ITEM_TYPES_ORDER, ITEM_TYPE_VISUAL } from '@/lib/item-type-styles';
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type CardTypeSelectorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedItemType: ItemType;
  canManageClasses: boolean;
  onSelect: (itemType: ItemType) => void;
};

type CardTypeGridProps = {
  open: boolean;
  creatableTypes: ItemType[];
  suggestedItemType: ItemType;
  onSelect: (itemType: ItemType) => void;
};

function CardTypeGrid({ open, creatableTypes, suggestedItemType, onSelect }: CardTypeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const root = gridRef.current;
    if (!root) return;
    const primary =
      root.querySelector<HTMLButtonElement>(`[data-item-type="${suggestedItemType}"]`) ??
      root.querySelector<HTMLButtonElement>('button[type="button"][data-item-type]');
    primary?.focus();
  }, [open, suggestedItemType, creatableTypes]);

  const handleChoose = (selectedType: ItemType) => {
    console.log('[DEBUG] Card type selected from grid:', selectedType);
    onSelect(selectedType);
  };

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-3 gap-3 md:grid-cols-4"
      role="list"
      aria-label="Card types"
    >
      {creatableTypes.map((type) => {
        const visual = ITEM_TYPE_VISUAL[type];
        const Icon = visual.Icon;
        return (
          <button
            key={type}
            type="button"
            role="listitem"
            data-item-type={type}
            onClick={() => handleChoose(type)}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-xs font-medium transition outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              visual.typeChip,
            )}
          >
            <Icon className="size-7 shrink-0" strokeWidth={2} aria-hidden />
            <span className="leading-tight">{visual.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CardTypeSelectorModal({
  open,
  onOpenChange,
  suggestedItemType,
  canManageClasses,
  onSelect,
}: CardTypeSelectorModalProps) {
  const isDesktop = !useIsNarrowBelowMd();
  const creatableTypes = useMemo(
    () => ITEM_TYPES_ORDER.filter((t) => t !== 'class' || canManageClasses),
    [canManageClasses],
  );

  useEffect(() => {
    if (!open) return;
    console.log(
      '[DEBUG] CardTypeSelector mounted. Suggested type:',
      suggestedItemType,
      '| Is Desktop:',
      isDesktop,
    );
  }, [open, suggestedItemType, isDesktop]);

  const grid = (
    <CardTypeGrid
      open={open}
      creatableTypes={creatableTypes}
      suggestedItemType={suggestedItemType}
      onSelect={onSelect}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a card type</DialogTitle>
            <DialogDescription className="sr-only">
              Select a BuddyBubble card type to create. Use Enter on the focused option to confirm.
            </DialogDescription>
          </DialogHeader>
          {grid}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-4 p-6">
        <SheetTitle className="text-lg font-semibold text-foreground">
          Choose a card type
        </SheetTitle>
        {grid}
      </SheetContent>
    </Sheet>
  );
}
