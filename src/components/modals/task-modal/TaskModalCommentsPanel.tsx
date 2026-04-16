'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import type { TaskComment } from '@/types/task-modal';

export type TaskModalCommentsPanelProps = {
  comments: TaskComment[];
  commentUserById: Record<string, { displayName: string; avatarUrl: string | null }>;
  newComment: string;
  onNewCommentChange: (value: string) => void;
  onPostComment: () => void | Promise<void>;
  canWrite: boolean;
  taskId: string | null;
  isCreateMode: boolean;
  typeNoun: string;
};

export function TaskModalCommentsPanel({
  comments,
  commentUserById,
  newComment,
  onNewCommentChange,
  onPostComment,
  canWrite,
  taskId,
  isCreateMode,
  typeNoun,
}: TaskModalCommentsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        <ul className="space-y-3">
          {comments.map((c) => {
            const author = commentUserById[c.user_id];
            const displayName = author?.displayName ?? 'Member';
            const avatarUrl = author?.avatarUrl ?? null;
            return (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
              >
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/15 text-sm font-bold text-primary">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      (displayName[0]?.toUpperCase() ?? '?')
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-foreground">{displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTimestamp(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground">{c.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {canWrite && taskId ? (
        <div className="space-y-2">
          <Label htmlFor="new-comment">Add comment</Label>
          <Textarea
            id="new-comment"
            value={newComment}
            onChange={(e) => onNewCommentChange(e.target.value)}
            rows={3}
          />
          <Button
            type="button"
            size="sm"
            disabled={!newComment.trim()}
            onClick={() => void onPostComment()}
          >
            Post comment
          </Button>
        </div>
      ) : null}
      {isCreateMode ? (
        <p className="text-xs text-muted-foreground">Create the {typeNoun} to add comments.</p>
      ) : null}
    </div>
  );
}
