import type { WorkspaceCategory } from '@/types/database';

export type SeedBubble = { name: string };
export type SeedColumn = { name: string; slug: string; position: number };

/**
 * Default Bubbles (channels) and Kanban column slugs seeded when a workspace is created.
 * Task `status` values match `slug` for the workspace's board_columns.
 */
export const WORKSPACE_SEED_BY_CATEGORY: Record<
  WorkspaceCategory,
  { bubbles: SeedBubble[]; columns: SeedColumn[] }
> = {
  community: {
    bubbles: [
      { name: 'Announcements' },
      { name: 'General Chat' },
      { name: 'Upcoming Events' },
      { name: 'Volunteer Coordination' },
    ],
    columns: [
      { name: 'Planning', slug: 'planning', position: 0 },
      { name: 'Scheduled', slug: 'scheduled', position: 1 },
      { name: 'Today', slug: 'today', position: 2 },
      { name: 'Past Events', slug: 'past_events', position: 3 },
    ],
  },
  kids: {
    bubbles: [
      { name: 'Announcements' },
      { name: 'Schedule Sync' },
      { name: 'Homework Help' },
      { name: 'Fun Stuff' },
    ],
    columns: [
      { name: 'Ideas/Wishlist', slug: 'ideas_wishlist', position: 0 },
      { name: 'Scheduled', slug: 'scheduled', position: 1 },
      { name: 'Today!', slug: 'today', position: 2 },
      { name: 'Done!', slug: 'done', position: 3 },
    ],
  },
  business: {
    bubbles: [
      { name: 'Dev Ops' },
      { name: 'Customer Success' },
      { name: 'General' },
      { name: 'Announcements' },
    ],
    columns: [
      { name: 'Todo', slug: 'todo', position: 0 },
      { name: 'In Progress', slug: 'in_progress', position: 1 },
      { name: 'Review', slug: 'review', position: 2 },
      { name: 'Done', slug: 'done', position: 3 },
    ],
  },
  fitness: {
    bubbles: [
      { name: 'Programs' },
      { name: 'Workouts' },
      { name: 'Classes' },
      { name: 'Trainer' },
    ],
    columns: [
      { name: 'Planned', slug: 'planned', position: 0 },
      { name: 'Scheduled', slug: 'scheduled', position: 1 },
      { name: 'Today', slug: 'today', position: 2 },
      { name: 'Completed', slug: 'completed', position: 3 },
    ],
  },
  class: {
    bubbles: [
      { name: 'Announcements' },
      { name: 'Course Materials' },
      { name: 'Assignments' },
      { name: 'Q&A' },
    ],
    columns: [
      { name: 'To Do', slug: 'todo', position: 0 },
      { name: 'In Progress', slug: 'in_progress', position: 1 },
      { name: 'Submitted', slug: 'submitted', position: 2 },
      { name: 'Graded', slug: 'graded', position: 3 },
    ],
  },
};
