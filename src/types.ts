export type Department = string;
export type UserRole = 'Admin' | 'Lead' | 'Member' | 'Guest';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  department: Department;
  attachments?: Attachment[];
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
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'Todo' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
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
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: UserRole;
  department?: Department;
  channelIds?: string[]; // IDs of channels the user is assigned to
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
}
