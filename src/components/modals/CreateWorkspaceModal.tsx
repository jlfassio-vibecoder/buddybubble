'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, GraduationCap, Heart, Users } from 'lucide-react';
import { createWorkspaceFromModal } from '@/app/(dashboard)/app/actions';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatUserFacingError } from '@/lib/format-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';

const CATEGORY_OPTIONS: {
  value: WorkspaceCategory;
  label: string;
  hint: string;
  icon: typeof Building2;
}[] = [
  { value: 'business', label: 'Business', hint: 'Teams & companies', icon: Building2 },
  { value: 'kids', label: 'Kids', hint: 'Family & children', icon: Heart },
  { value: 'class', label: 'Class', hint: 'Courses & learning', icon: GraduationCap },
  { value: 'community', label: 'Community', hint: 'Clubs & neighbors', icon: Users },
];

export type CreateWorkspaceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateWorkspaceModal({ open, onOpenChange }: CreateWorkspaceModalProps) {
  const router = useRouter();
  const loadUserWorkspaces = useWorkspaceStore((s) => s.loadUserWorkspaces);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkspaceCategory>('business');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setName('');
    setCategory('business');
    setPending(false);
    setError(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a BuddyBubble name.');
      return;
    }

    setPending(true);
    try {
      const result = await createWorkspaceFromModal(trimmed, category);
      if (!result.ok) {
        setError(formatUserFacingError(result.error));
        setPending(false);
        return;
      }
      await loadUserWorkspaces();
      onOpenChange(false);
      router.push(`/app/${result.workspaceId}`);
    } catch (err) {
      setError(formatUserFacingError(err));
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md" aria-describedby="create-ws-desc">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader className="space-y-1 border-b border-border px-6 py-5 text-left">
            <DialogTitle>Create BuddyBubble</DialogTitle>
            <DialogDescription id="create-ws-desc">
              Name your BuddyBubble and pick a category template. We seed starter Bubbles and a
              matching board for that template before you land in the app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {error && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="ws-name">BuddyBubble name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                disabled={pending}
                autoComplete="organization"
                className="h-10"
              />
            </div>

            <div className="space-y-3">
              <Label>Category</Label>
              <RadioGroup
                value={category}
                onValueChange={(v) => setCategory(v as WorkspaceCategory)}
                className="grid gap-2"
                disabled={pending}
              >
                {CATEGORY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = category === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                          : 'border-border hover:border-input hover:bg-muted/80',
                        pending && 'pointer-events-none opacity-60',
                      )}
                    >
                      <RadioGroupItem
                        value={opt.value}
                        id={`cat-${opt.value}`}
                        className="mt-0.5"
                      />
                      <Icon
                        className={cn(
                          'mt-0.5 h-5 w-5 shrink-0',
                          selected ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-muted/50 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Building BuddyBubble…' : 'Create BuddyBubble'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
