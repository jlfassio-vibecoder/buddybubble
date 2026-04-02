export type Department = string;
export type UserRole = 'Admin' | 'Lead' | 'Member' | 'Guest';

export interface Message {
  id: string;
  sender: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  department: Department;
  attachments?: Attachment[];
  uid: string; // Firebase Auth UID
  parentId?: string; // ID of the parent message if this is a reply
  threadCount?: number; // Number of replies if this is a parent message
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface ActivityLogEntry {
  id: string;
  user: string;
  action: string;
  timestamp: Date;
  field?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  timestamp: Date;
  storagePath?: string;
}

export type TaskType = 'task' | 'request' | 'idea';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'Todo' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  type?: TaskType;
  // Feature Request fields
  impact?: 'Low' | 'Medium' | 'High';
  urgency?: 'Low' | 'Medium' | 'High';
  userStory?: string;
  // Idea fields
  category?: string;
  potentialValue?: string;
  upvotes?: string[]; // Array of user UIDs who upvoted
  assignee: string;
  assigner?: string;
  tags?: string[];
  dueDate?: Date;
  comments?: Comment[];
  subtasks?: Subtask[];
  attachments?: Attachment[];
  dependencies?: string[]; // Array of task IDs
  relatedTaskIds?: string[]; // Array of task IDs
  channelId?: string; // Associated channel ID
  createdAt: Date;
  activityLog?: ActivityLogEntry[];
  uid: string; // Firebase Auth UID
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: UserRole;
  department?: Department;
  channelIds?: string[]; // IDs of channels the user is assigned to
  status?: 'online' | 'offline' | 'away';
  lastSeen?: Date;
}

export interface Channel {
  id: string;
  name: Department;
  icon: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  tags?: string[];
  subtasks?: { title: string; completed: boolean }[];
  channelId?: string;
  uid: string; // Firebase Auth UID
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: 'thread_reply' | 'task_assigned' | 'mention';
  relatedId: string;
  read: boolean;
  timestamp: Date;
}
