import type { Json } from '@/types/database';
import { asStringList, parseTaskMetadata } from '@/lib/item-metadata';

/** Read `metadata.votes` (non-negative integer; 0 when missing/invalid). */
export function readIdeaVotes(metadata: Json | null | undefined): number {
  const o = parseTaskMetadata(metadata ?? {}) as Record<string, unknown>;
  const raw = o.votes;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

/** Read `metadata.voted_by` user ids. */
export function readIdeaVotedBy(metadata: Json | null | undefined): string[] {
  const o = parseTaskMetadata(metadata ?? {}) as Record<string, unknown>;
  return asStringList(o.voted_by);
}

export type IdeaVoteState = {
  votes: number;
  voted: boolean;
  votedBy: string[];
};

/**
 * Display/vote state for the current viewer.
 * `voted_by` is SoT for membership; `votes` may retain a legacy anonymous remainder
 * when `votes > voted_by.length`.
 */
export function ideaVoteState(
  metadata: Json | null | undefined,
  userId: string | null | undefined,
): IdeaVoteState {
  const votedBy = readIdeaVotedBy(metadata);
  const rawVotes = readIdeaVotes(metadata);
  const votes = votedBy.length > 0 ? Math.max(rawVotes, votedBy.length) : rawVotes;
  const voted = Boolean(userId && votedBy.includes(userId));
  return { votes, voted, votedBy };
}

export type IdeaVoteToggleResult = {
  votes: number;
  votedBy: string[];
};

/** Toggle the current user's vote; preserves legacy anonymous vote remainder. */
export function toggleIdeaVote(
  metadata: Json | null | undefined,
  userId: string,
): IdeaVoteToggleResult {
  const { votes: prevVotes, voted, votedBy } = ideaVoteState(metadata, userId);
  if (voted) {
    const nextBy = votedBy.filter((id) => id !== userId);
    return { votedBy: nextBy, votes: Math.max(0, prevVotes - 1) };
  }
  return { votedBy: [...votedBy, userId], votes: prevVotes + 1 };
}
