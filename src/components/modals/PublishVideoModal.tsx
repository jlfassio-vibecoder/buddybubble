'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  getVideoLibraryPublishContextAction,
  publishToVideoLibraryAction,
  type VideoLibraryPrivateBubble,
} from '@/app/(dashboard)/app/[workspace_id]/video-library-actions';
import { Button } from '@/components/ui/button';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { VideoLibraryAccessScope } from '@/lib/video-library/publish';
import { cn } from '@/lib/utils';

export type PublishVideoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  classInstanceId: string;
  /** Offering name (or other) prefilled into Title */
  defaultTitle: string;
};

type AudienceChoice = 'workspace' | 'bubble_members' | 'public_storefront';

const selectClassName = cn(
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
  'dark:bg-input/30 dark:disabled:bg-input/80',
);

export function PublishVideoModal({
  open,
  onOpenChange,
  workspaceId,
  classInstanceId,
  defaultTitle,
}: PublishVideoModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [audience, setAudience] = useState<AudienceChoice>('workspace');
  const [privateBubbleId, setPrivateBubbleId] = useState('');
  const [privateBubbles, setPrivateBubbles] = useState<VideoLibraryPrivateBubble[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [hubBubbleId, setHubBubbleId] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const publicEnabled = isPublic && Boolean(publicSlug?.trim());

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle.trim() || 'Untitled recording');
    setAudience('workspace');
    setPrivateBubbleId('');
    setFormError(null);
    setSubmitting(false);

    let cancelled = false;
    setLoadingContext(true);
    void (async () => {
      const res = await getVideoLibraryPublishContextAction({ workspaceId });
      if (cancelled) return;
      setLoadingContext(false);
      if ('error' in res) {
        setFormError(res.error);
        setPrivateBubbles([]);
        setIsPublic(false);
        setPublicSlug(null);
        setHubBubbleId(null);
        return;
      }
      setIsPublic(res.isPublic);
      setPublicSlug(res.publicSlug);
      setHubBubbleId(res.hubBubbleId);
      setPrivateBubbles(res.privateBubbles);
      if (res.privateBubbles.length === 1) {
        setPrivateBubbleId(res.privateBubbles[0]!.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, defaultTitle]);

  const canSubmit =
    !loadingContext &&
    !submitting &&
    Boolean(hubBubbleId || audience === 'bubble_members') &&
    (audience !== 'bubble_members' || Boolean(privateBubbleId.trim())) &&
    (audience !== 'public_storefront' || publicEnabled);

  const handleSubmit = async () => {
    setFormError(null);
    if (audience === 'public_storefront' && !publicEnabled) {
      setFormError('Enable a public Astro page in workspace settings first.');
      return;
    }
    if (audience === 'bubble_members' && !privateBubbleId.trim()) {
      setFormError('Select a private or DM bubble.');
      return;
    }
    if (audience !== 'bubble_members' && !hubBubbleId) {
      setFormError('Video Library bubble not found.');
      return;
    }

    setSubmitting(true);
    const accessScope: VideoLibraryAccessScope = audience;
    const res = await publishToVideoLibraryAction({
      workspaceId,
      classInstanceId,
      accessScope,
      bubbleId: audience === 'bubble_members' ? privateBubbleId.trim() : undefined,
      title: title.trim() || null,
    });
    setSubmitting(false);

    if ('error' in res) {
      setFormError(res.error);
      toast.error(res.error);
      return;
    }

    toast.success('Published to Video Library');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to Video Library</DialogTitle>
          <DialogDescription>
            Choose a title and who can see this recording in your Social Space.
          </DialogDescription>
        </DialogHeader>

        {loadingContext ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading publish options…
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="publish-video-title">Title</Label>
              <Input
                id="publish-video-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Workout title"
                disabled={submitting}
              />
            </div>

            <div className="grid gap-2">
              <Label>Audience</Label>
              <RadioGroup
                value={audience}
                onValueChange={(v) => setAudience(v as AudienceChoice)}
                className="gap-3"
                disabled={submitting}
              >
                <label className="flex cursor-pointer items-start gap-2.5">
                  <RadioGroupItem value="workspace" id="audience-workspace" className="mt-0.5" />
                  <span className="grid gap-0.5 text-sm">
                    <span className="font-medium">Everyone in Workspace</span>
                    <span className="text-muted-foreground">
                      Visible to members in the Video Library bubble.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <RadioGroupItem
                    value="bubble_members"
                    id="audience-private"
                    className="mt-0.5"
                    disabled={privateBubbles.length === 0}
                  />
                  <span className="grid gap-0.5 text-sm">
                    <span className="font-medium">Specific people</span>
                    <span className="text-muted-foreground">
                      Publish into an existing private or DM bubble.
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    'flex items-start gap-2.5',
                    publicEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                  )}
                >
                  <RadioGroupItem
                    value="public_storefront"
                    id="audience-public"
                    className="mt-0.5"
                    disabled={!publicEnabled}
                  />
                  <span className="grid gap-0.5 text-sm">
                    <span className="font-medium">Public on Astro page</span>
                    <span className="text-muted-foreground">
                      {publicEnabled
                        ? `Listed on your public page (/${publicSlug}).`
                        : 'Enable a public workspace slug in settings to use this option.'}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {audience === 'bubble_members' ? (
              <div className="grid gap-2">
                <Label htmlFor="publish-private-bubble">Private / DM bubble</Label>
                {privateBubbles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No private or DM bubbles yet. Create one in the sidebar, then try again.
                  </p>
                ) : (
                  <select
                    id="publish-private-bubble"
                    className={selectClassName}
                    value={privateBubbleId}
                    onChange={(e) => setPrivateBubbleId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">Select a bubble…</option>
                    {privateBubbles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.bubble_type === 'dm' ? ' (DM)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : null}

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Publishing…
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
