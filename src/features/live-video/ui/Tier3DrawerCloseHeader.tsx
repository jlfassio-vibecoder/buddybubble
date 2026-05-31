'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type Tier3DrawerCloseHeaderProps = {
  onClose: () => void;
  className?: string;
};

export function Tier3DrawerCloseHeader({ onClose, className }: Tier3DrawerCloseHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label="Close exercises panel"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
