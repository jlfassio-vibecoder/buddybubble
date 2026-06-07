export type TaskCardShape = {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  metadata: unknown;
  scheduled_on: string | null;
  created_at: string;
};

export type PublicClassCardData = {
  id: string;
  task_id: string;
  scheduled_at: string;
  offering: {
    name: string;
    description: string | null;
    duration_min: number;
    location: string | null;
  };
};

export type PublicFeedItem =
  | {
      kind: 'task';
      taskId: string;
      bubbleId: string;
      sortAt: string;
      card: TaskCardShape;
    }
  | {
      kind: 'class';
      taskId: string;
      bubbleId: string;
      sortAt: string;
      instance: PublicClassCardData;
    };

export function sortPublicFeedItems(items: PublicFeedItem[]): PublicFeedItem[] {
  return [...items].sort((a, b) => a.sortAt.localeCompare(b.sortAt));
}
