/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { KanbanBoard } from './components/KanbanBoard';
import { ProfileModal } from './components/ProfileModal';
import { ManageChannelsModal } from './components/ManageChannelsModal';
import { CHANNELS as INITIAL_CHANNELS, INITIAL_MESSAGES, INITIAL_TASKS, INITIAL_TEMPLATES } from './constants';
import { Channel, Message, Task, ActivityLogEntry, UserProfile, TaskTemplate } from './types';
import { GripVertical } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [activeChannel, setActiveChannel] = useState<Channel>(INITIAL_CHANNELS[0]);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [templates, setTemplates] = useState<TaskTemplate[]>(INITIAL_TEMPLATES);
  const [chatWidth, setChatWidth] = useState(50); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isManageChannelsModalOpen, setIsManageChannelsModalOpen] = useState(false);
  const [user, setUser] = useState<UserProfile>({
    id: 'u1',
    name: 'John Doe',
    email: 'j.doe@teamsync.com',
    avatar: 'https://picsum.photos/seed/john/100/100',
    role: 'Admin',
    department: 'Dev Ops',
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      // Calculate relative X position within the main container (excluding sidebar)
      // Sidebar is fixed width (usually around 260px based on typical layouts, but let's calculate relative to main)
      const relativeX = e.clientX - containerRect.left;
      const newWidth = (relativeX / containerRect.width) * 100;
      
      // Constrain width between 20% and 80%
      if (newWidth >= 20 && newWidth <= 80) {
        setChatWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: user.name,
      senderAvatar: user.avatar,
      content,
      timestamp: new Date(),
      department: activeChannel.name,
    };
    setMessages([...messages, newMessage]);
  };

  const handleUpdateProfile = (updatedUser: UserProfile) => {
    setUser(updatedUser);
  };

  const handleAddChannel = (name: string) => {
    const newChannel: Channel = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      icon: 'Hash',
    };
    setChannels([...channels, newChannel]);
  };

  const handleUpdateChannel = (id: string, name: string) => {
    setChannels(channels.map(c => c.id === id ? { ...c, name } : c));
    if (activeChannel.id === id) {
      setActiveChannel({ ...activeChannel, name });
    }
  };

  const handleDeleteChannel = (id: string) => {
    if (channels.length <= 1) return;
    const newChannels = channels.filter(c => c.id !== id);
    setChannels(newChannels);
    if (activeChannel.id === id) {
      setActiveChannel(newChannels[0]);
    }
    // Optionally reassign tasks or delete them? 
    // For now, let's just keep them but they won't show up if filtered by channel
  };

  const handleSaveTemplate = (template: Omit<TaskTemplate, 'id'>) => {
    const newTemplate: TaskTemplate = {
      ...template,
      id: Math.random().toString(36).substr(2, 9),
    };
    setTemplates([...templates, newTemplate]);
  };

  const handleTaskMove = (taskId: string, newStatus: Task['status']) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const logEntry: ActivityLogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          user: user.name,
          action: 'changed status',
          field: 'status',
          oldValue: t.status,
          newValue: newStatus,
          timestamp: new Date(),
        };
        return { 
          ...t, 
          status: newStatus,
          activityLog: [logEntry, ...(t.activityLog || [])]
        };
      }
      return t;
    }));
  };

  const handleCreateTask = (taskData: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>): string => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newTask: Task = {
      ...taskData,
      id: newId,
      status: 'Todo',
      createdAt: new Date(),
      activityLog: [{
        id: Math.random().toString(36).substr(2, 9),
        user: 'John Doe',
        action: 'created task',
        timestamp: new Date(),
      }],
    };
    setTasks([newTask, ...tasks]);
    return newId;
  };

  const handleUpdateTask = (taskId: string, taskData: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newLogs: ActivityLogEntry[] = [];
        const currentUser = user.name;

        if (t.title !== taskData.title) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `renamed task from "${t.title}" to "${taskData.title}"`,
            field: 'title',
            oldValue: t.title,
            newValue: taskData.title,
            timestamp: new Date(),
          });
        }
        if (t.description !== taskData.description) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: 'updated description',
            timestamp: new Date(),
          });
        }
        if (t.priority !== taskData.priority) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `changed priority from ${t.priority} to ${taskData.priority}`,
            field: 'priority',
            oldValue: t.priority,
            newValue: taskData.priority,
            timestamp: new Date(),
          });
        }
        if (t.assignee !== taskData.assignee) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `reassigned task from ${t.assignee} to ${taskData.assignee}`,
            field: 'assignee',
            oldValue: t.assignee,
            newValue: taskData.assignee,
            timestamp: new Date(),
          });
        }
        if (t.assigner !== taskData.assigner) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `changed assigner from ${t.assigner || 'None'} to ${taskData.assigner || 'None'}`,
            field: 'assigner',
            oldValue: t.assigner || 'None',
            newValue: taskData.assigner || 'None',
            timestamp: new Date(),
          });
        }
        
        const oldTags = (t.tags || []).join(', ');
        const newTags = (taskData.tags || []).join(', ');
        if (oldTags !== newTags) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `updated tags from [${oldTags || 'none'}] to [${newTags || 'none'}]`,
            field: 'tags',
            oldValue: oldTags || 'None',
            newValue: newTags || 'None',
            timestamp: new Date(),
          });
        }
        
        const oldDueTime = t.dueDate ? new Date(t.dueDate).getTime() : 0;
        const newDueTime = taskData.dueDate ? new Date(taskData.dueDate).getTime() : 0;
        
        if (oldDueTime !== newDueTime) {
          const oldDateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'None';
          const newDateStr = taskData.dueDate ? new Date(taskData.dueDate).toLocaleDateString() : 'None';
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `changed due date from ${oldDateStr} to ${newDateStr}`,
            field: 'dueDate',
            oldValue: oldDateStr,
            newValue: newDateStr,
            timestamp: new Date(),
          });
        }

        const oldAttachments = (t.attachments || []).length;
        const newAttachments = (taskData.attachments || []).length;
        if (oldAttachments !== newAttachments) {
          const diff = newAttachments - oldAttachments;
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: diff > 0 ? `attached ${diff} file(s)` : `removed ${Math.abs(diff)} file(s)`,
            timestamp: new Date(),
          });
        }

        const oldCompletedCount = (t.subtasks || []).filter(s => s.completed).length;
        const newCompletedCount = (taskData.subtasks || []).filter(s => s.completed).length;
        
        if (oldCompletedCount !== newCompletedCount) {
          newLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            user: currentUser,
            action: `updated subtasks (${newCompletedCount}/${(taskData.subtasks || []).length} completed)`,
            timestamp: new Date(),
          });
        }

        return { 
          ...t, 
          ...taskData,
          activityLog: [...newLogs, ...(t.activityLog || [])]
        };
      }
      return t;
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const filteredMessages = messages.filter(m => m.department === activeChannel.name);

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden font-sans antialiased">
      <Sidebar 
        activeChannel={activeChannel} 
        onChannelSelect={setActiveChannel} 
        channels={channels}
        onManageChannels={() => setIsManageChannelsModalOpen(true)}
        user={user}
        onEditProfile={() => setIsProfileModalOpen(true)}
      />
      
      <main 
        ref={containerRef}
        className={cn(
          "flex-1 flex overflow-hidden select-none",
          isResizing && "cursor-col-resize"
        )}
      >
        {/* Left Side: Chat */}
        <div 
          style={{ width: `${chatWidth}%` }}
          className="h-full flex flex-col shadow-2xl z-10 relative"
        >
          <ChatArea 
            channel={activeChannel} 
            allMessages={messages} 
            onSendMessage={handleSendMessage} 
          />
          
          {/* Resize Handle */}
          <div
            onMouseDown={startResizing}
            className={cn(
              "absolute top-0 -right-1.5 w-3 h-full z-20 cursor-col-resize flex items-center justify-center group",
              isResizing && "bg-indigo-500/10"
            )}
          >
            <div className={cn(
              "w-1 h-12 rounded-full bg-slate-300 group-hover:bg-indigo-400 transition-colors flex items-center justify-center",
              isResizing && "bg-indigo-500"
            )}>
              <GripVertical className="w-3 h-3 text-white opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        </div>

        {/* Right Side: Kanban */}
        <div 
          style={{ width: `${100 - chatWidth}%` }}
          className="h-full"
        >
          <KanbanBoard 
            tasks={tasks} 
            activeChannel={activeChannel}
            channels={channels}
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            user={user}
            onTaskMove={handleTaskMove} 
            onAddTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        </div>
      </main>

      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        channels={channels}
        onUpdate={handleUpdateProfile}
      />

      <ManageChannelsModal
        isOpen={isManageChannelsModalOpen}
        onClose={() => setIsManageChannelsModalOpen(false)}
        channels={channels}
        onAddChannel={handleAddChannel}
        onUpdateChannel={handleUpdateChannel}
        onDeleteChannel={handleDeleteChannel}
        user={user}
      />
    </div>
  );
}

