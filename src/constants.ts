import { Channel, Message, Task, TaskTemplate } from './types';

export const CHANNELS: Channel[] = [
  { id: '1', name: 'Sales & Marketing', icon: 'Megaphone' },
  { id: '2', name: 'Dev Ops', icon: 'Terminal' },
  { id: '3', name: 'Success Managers', icon: 'Users' },
  { id: '4', name: 'Features Request', icon: 'Lightbulb' },
  { id: '5', name: 'Ideas', icon: 'Lightbulb' },
];

export const INITIAL_TEMPLATES: TaskTemplate[] = [
  {
    id: 'temp1',
    name: 'New Client Onboarding',
    title: 'Onboard New Client: [Client Name]',
    description: 'Follow the standard onboarding procedure for new clients.',
    priority: 'Medium',
    tags: ['Onboarding', 'Client Success'],
    subtasks: [
      { title: 'Send welcome email', completed: false },
      { title: 'Schedule kickoff call', completed: false },
      { title: 'Set up account in CRM', completed: false },
      { title: 'Share onboarding documents', completed: false },
    ],
    uid: 'system',
  },
  {
    id: 'temp2',
    name: 'Weekly Server Maintenance',
    title: 'Weekly Server Maintenance - [Date]',
    description: 'Perform routine checks and updates on all production servers.',
    priority: 'High',
    tags: ['Infrastructure', 'Maintenance'],
    subtasks: [
      { title: 'Check disk space', completed: false },
      { title: 'Review error logs', completed: false },
      { title: 'Apply security patches', completed: false },
      { title: 'Verify backups', completed: false },
    ],
    uid: 'system',
  },
];

export const INITIAL_MESSAGES: Message[] = [
  {
    id: 'm1',
    sender: 'Alice',
    senderAvatar: 'https://picsum.photos/seed/alice/100/100',
    content: 'Hey team, how is the Q2 campaign looking?',
    timestamp: new Date(Date.now() - 3600000),
    department: 'Sales & Marketing',
    uid: 'u2',
  },
  {
    id: 'm2',
    sender: 'Bob',
    senderAvatar: 'https://picsum.photos/seed/bob/100/100',
    content: 'Just finished the draft for the new landing page.',
    timestamp: new Date(Date.now() - 1800000),
    department: 'Sales & Marketing',
    uid: 'u3',
  },
  {
    id: 'm3',
    sender: 'Charlie',
    senderAvatar: 'https://picsum.photos/seed/charlie/100/100',
    content: 'Server migration is 80% complete.',
    timestamp: new Date(Date.now() - 7200000),
    department: 'Dev Ops',
    uid: 'u4',
  },
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Update Landing Page',
    description: 'Refresh the hero section with new copy.',
    status: 'In Progress',
    priority: 'High',
    assignee: 'Bob',
    assigner: 'Alice',
    tags: ['Design', 'Frontend'],
    dueDate: new Date(Date.now() + 86400000 * 2), // 2 days from now
    createdAt: new Date(Date.now() - 86400000 * 3), // 3 days ago
    uid: 'u3',
    activityLog: [
      {
        id: 'l1',
        user: 'System',
        action: 'created task',
        timestamp: new Date(Date.now() - 86400000 * 3),
      }
    ],
  },
  {
    id: 't2',
    title: 'Database Backup',
    description: 'Ensure all production databases are backed up.',
    status: 'Todo',
    priority: 'Medium',
    assignee: 'Charlie',
    assigner: 'Bob',
    tags: ['Infrastructure', 'Critical'],
    dueDate: new Date(Date.now() + 86400000 * 5), // 5 days from now
    createdAt: new Date(Date.now() - 86400000 * 1), // 1 day ago
    uid: 'u4',
    activityLog: [
      {
        id: 'l2',
        user: 'System',
        action: 'created task',
        timestamp: new Date(Date.now() - 86400000 * 1),
      }
    ],
  },
  {
    id: 't3',
    title: 'Client Onboarding',
    description: 'Send welcome package to NewCorp.',
    status: 'Done',
    priority: 'Low',
    assignee: 'Alice',
    assigner: 'Charlie',
    tags: ['Customer Success'],
    dueDate: new Date(Date.now() - 86400000), // Yesterday
    createdAt: new Date(Date.now() - 86400000 * 5), // 5 days ago
    uid: 'u2',
    activityLog: [
      {
        id: 'l3',
        user: 'System',
        action: 'created task',
        timestamp: new Date(Date.now() - 86400000 * 5),
      }
    ],
  },
];
