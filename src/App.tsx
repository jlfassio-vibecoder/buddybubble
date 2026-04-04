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
import { Login } from './components/Login';
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc, 
  setDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  where,
  getDocs,
  signOut,
  handleFirestoreError,
  writeBatch,
  OperationType
} from './firebase';
import { CHANNELS as INITIAL_CHANNELS, INITIAL_TEMPLATES } from './constants';
import { Channel, Message, Task, ActivityLogEntry, UserProfile, TaskTemplate, Notification } from './types';
import { GripVertical, Loader2, PanelLeftOpen, MessageSquare } from 'lucide-react';
import { cn } from './lib/utils';
import { setFaviconBadge } from './lib/favicon';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>({ id: 'all', name: 'All Channels', icon: 'Hash' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatWidth, setChatWidth] = useState(50); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isManageChannelsModalOpen, setIsManageChannelsModalOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            // Update status to online if it's not already
            if (userData.status !== 'online') {
              await updateDoc(doc(db, 'users', firebaseUser.uid), { 
                status: 'online',
                lastSeen: new Date()
              });
              userData.status = 'online';
            }
            setUser(userData);
          } else {
            // Firestore rules require a valid email string; OAuth can omit email in edge cases
            const safeLocal = firebaseUser.uid.replace(/[^a-zA-Z0-9._%+-]/g, '_') || 'user';
            const email =
              firebaseUser.email?.trim() ||
              firebaseUser.providerData[0]?.email?.trim() ||
              `${safeLocal}@placeholder.local`;
            const newUser: UserProfile = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || 'Anonymous',
              email,
              avatar: firebaseUser.photoURL || '',
              // Admin only from Firebase Auth canonical email — not providerData/placeholder used for `email`
              role: firebaseUser.email?.trim() === 'jlfassio@gmail.com' ? 'Admin' : 'Member',
              department: 'General',
              channelIds: [],
              status: 'online',
              lastSeen: new Date()
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            setUser(newUser);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to load or create user profile (check Firestore rules and network):', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Channels
    const unsubChannels = onSnapshot(collection(db, 'channels'), (snapshot) => {
      const channelList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Channel));
      
      // Ensure all initial channels exist
      INITIAL_CHANNELS.forEach(async (c) => {
        const exists = channelList.some(cl => cl.id === c.id);
        if (!exists) {
          try {
            await setDoc(doc(db, 'channels', c.id), c);
          } catch (error) {
            // Seed is best-effort; do not throw (avoids uncaught rejections on snapshot). Deploy matching rules for seed IDs.
            console.warn(`Failed to seed channel ${c.id}:`, error);
          }
        }
      });

      setChannels(channelList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'channels');
    });

    // Messages
    const unsubMessages = onSnapshot(query(collection(db, 'messages'), orderBy('timestamp', 'asc')), (snapshot) => {
      const msgList = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          ...data, 
          id: doc.id, 
          timestamp: data.timestamp?.toDate() || new Date() 
        } as Message;
      });
      setMessages(msgList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    // Tasks
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const taskList = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          ...data, 
          id: doc.id, 
          createdAt: data.createdAt?.toDate() || new Date(),
          dueDate: data.dueDate?.toDate() || undefined,
          comments: data.comments?.map((c: any) => ({
            ...c,
            timestamp: c.timestamp?.toDate() || new Date()
          })),
          activityLog: data.activityLog?.map((log: any) => ({
            ...log,
            timestamp: log.timestamp?.toDate() || new Date()
          })),
          attachments: data.attachments?.map((a: any) => ({
            ...a,
            timestamp: a.timestamp?.toDate() || new Date()
          }))
        } as Task;
      });
      setTasks(taskList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    // Templates
    const unsubTemplates = onSnapshot(collection(db, 'templates'), (snapshot) => {
      const templateList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TaskTemplate));
      if (templateList.length === 0) {
        // Seed initial templates if empty
        INITIAL_TEMPLATES.forEach(async (t) => {
          try {
            await setDoc(doc(db, 'templates', t.id), { ...t, uid: user.id });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `templates/${t.id}`);
          }
        });
      }
      setTemplates(templateList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'templates');
    });

    // Team Members
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          lastSeen: data.lastSeen?.toDate()
        } as UserProfile;
      });
      setTeamMembers(userList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Notifications
    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.id), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const notifList = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            timestamp: data.timestamp?.toDate() || new Date()
          } as Notification;
        });
        setNotifications(notifList);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    return () => {
      unsubChannels();
      unsubMessages();
      unsubTasks();
      unsubTemplates();
      unsubUsers();
      unsubNotifications();
    };
  }, [user, activeChannel]);

  // Presence logic
  useEffect(() => {
    if (!user) return;

    const setStatus = async (status: 'online' | 'offline' | 'away') => {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          status,
          lastSeen: new Date()
        });
      } catch (error) {
        // Silent fail for presence updates to avoid spamming error boundary
        console.warn('Presence update failed:', error);
      }
    };

    setStatus('online');

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setStatus('online');
      } else {
        setStatus('away');
      }
    };

    const handleBeforeUnload = () => {
      setStatus('offline');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setStatus('offline');
    };
  }, [user?.id]);

  // Favicon Badge Logic
  useEffect(() => {
    setFaviconBadge(0);
  }, []);

  useEffect(() => {
    const baseTitle = 'BuddyBubble';
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [unreadCount]);

  useEffect(() => {
    if (document.visibilityState === 'visible') {
      setUnreadCount(0);
      setFaviconBadge(0);
    }
  }, [messages.length, tasks.length]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setUnreadCount(0);
        setFaviconBadge(0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Update unread count when new items arrive and tab is hidden
  const prevMessagesLength = useRef(messages.length);
  const prevTasksLength = useRef(tasks.length);

  useEffect(() => {
    if (document.visibilityState === 'hidden') {
      let newItems = 0;
      if (messages.length > prevMessagesLength.current) {
        newItems += (messages.length - prevMessagesLength.current);
      }
      if (tasks.length > prevTasksLength.current) {
        newItems += (tasks.length - prevTasksLength.current);
      }
      
      if (newItems > 0) {
        setUnreadCount(prev => {
          const next = prev + newItems;
          setFaviconBadge(next);
          return next;
        });
      }
    }
    prevMessagesLength.current = messages.length;
    prevTasksLength.current = tasks.length;
  }, [messages.length, tasks.length]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const newWidth = (relativeX / containerRect.width) * 100;
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

  const handleSendMessage = async (content: string, parentId?: string) => {
    if (!user || !activeChannel) return;
    const newMessage = {
      sender: user.name,
      senderAvatar: user.avatar,
      content,
      timestamp: new Date(),
      department: activeChannel.id === 'all' ? 'All Channels' : activeChannel.name,
      uid: user.id,
      parentId: parentId || null,
      threadCount: 0
    };
    try {
      await addDoc(collection(db, 'messages'), newMessage);
      if (parentId) {
        const parentRef = doc(db, 'messages', parentId);
        const parentDoc = await getDoc(parentRef);
        if (parentDoc.exists()) {
          const parentData = parentDoc.data();
          const currentCount = parentData.threadCount || 0;
          await updateDoc(parentRef, { threadCount: currentCount + 1 });
          
          // Create notification for parent author if it's not the current user
          if (parentData.uid !== user.id) {
            await addDoc(collection(db, 'notifications'), {
              userId: parentData.uid,
              title: 'New Thread Reply',
              content: `${user.name} replied to your message: "${parentData.content.substring(0, 30)}..."`,
              type: 'thread_reply',
              relatedId: parentId,
              read: false,
              timestamp: new Date()
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    }
  };

  const handleUpdateProfile = async (updatedUser: UserProfile) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id), { ...updatedUser });
      setUser(updatedUser);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.id}`);
    }
  };

  const handleLogout = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          status: 'offline',
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Failed to set offline status on logout:', error);
      }
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleAddChannel = async (name: string) => {
    const newChannel = {
      name,
      icon: 'Hash',
    };
    try {
      await addDoc(collection(db, 'channels'), newChannel);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'channels');
    }
  };

  const handleUpdateChannel = async (id: string, name: string) => {
    try {
      await updateDoc(doc(db, 'channels', id), { name });
      if (activeChannel?.id === id) {
        setActiveChannel({ ...activeChannel, name });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `channels/${id}`);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (channels.length <= 1) return;
    try {
      await deleteDoc(doc(db, 'channels', id));
      if (activeChannel?.id === id) {
        setActiveChannel(channels.find(c => c.id !== id) || null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `channels/${id}`);
    }
  };

  const handleSaveTemplate = async (template: Omit<TaskTemplate, 'id'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'templates'), { ...template, uid: user.id });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'templates');
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: Task['status'], newPosition?: number) => {
    if (!user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const logEntry: ActivityLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      user: user.name,
      action: 'changed status',
      field: 'status',
      oldValue: task.status,
      newValue: newStatus,
      timestamp: new Date(),
    };

    try {
      const updateData: any = {
        status: newStatus,
        activityLog: [logEntry, ...(task.activityLog || [])]
      };
      
      if (newPosition !== undefined) {
        updateData.position = newPosition;
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
    }
  };

  const handleTaskReorder = async (taskId: string, newPosition: number, columnTasks: Task[]) => {
    if (!user) return;
    
    try {
      const batch = writeBatch(db);
      
      // Update the moved task
      batch.update(doc(db, 'tasks', taskId), { position: newPosition });
      
      // Update other tasks in the same column to ensure consistent ordering
      columnTasks.forEach((t, index) => {
        if (t.id !== taskId) {
          batch.update(doc(db, 'tasks', t.id), { position: index });
        }
      });
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tasks/reorder');
    }
  };

  const handleCreateTask = async (taskData: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>): Promise<string> => {
    if (!user) return '';
    const todoTasks = tasks.filter(t => t.status === 'Todo');
    const maxPosition = todoTasks.length > 0 
      ? Math.max(...todoTasks.map(t => t.position ?? 0)) 
      : -1;

    const newTask = {
      ...taskData,
      status: 'Todo',
      createdAt: new Date(),
      position: maxPosition + 1,
      uid: user.id,
      archived: false,
      activityLog: [{
        id: Math.random().toString(36).substr(2, 9),
        user: user.name,
        action: 'created task',
        timestamp: new Date(),
      }],
    };
    try {
      const docRef = await addDoc(collection(db, 'tasks'), newTask);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tasks');
      return '';
    }
  };

  const handleUpdateTask = async (taskId: string, taskData: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>) => {
    if (!user) return;
    const t = tasks.find(task => task.id === taskId);
    if (!t) return;

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

    if ((t.comments?.length || 0) < (taskData.comments?.length || 0)) {
      newLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        user: currentUser,
        action: 'added a comment',
        timestamp: new Date(),
      });
    }

    // Check for subtask completion notification
    const oldSubtasks = t.subtasks || [];
    const newSubtasks = taskData.subtasks || [];
    const wasCompleted = oldSubtasks.length > 0 && oldSubtasks.every(s => s.completed);
    const isNowCompleted = newSubtasks.length > 0 && newSubtasks.every(s => s.completed);

    if (!wasCompleted && isNowCompleted) {
      const notificationTitle = 'Task Subtasks Completed';
      const notificationContent = `All subtasks for "${t.title}" have been completed. The task is ready for final review.`;
      
      // Notify creator (if not the current user)
      if (t.uid !== user.id) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: t.uid,
            title: notificationTitle,
            content: notificationContent,
            type: 'mention',
            relatedId: taskId,
            read: false,
            timestamp: new Date()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'notifications');
        }
      }

      // Notify assignee (if not the current user and not the creator)
      const assigneeUser = teamMembers.find(m => m.name === taskData.assignee);
      if (assigneeUser && assigneeUser.id !== user.id && assigneeUser.id !== t.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: assigneeUser.id,
            title: notificationTitle,
            content: notificationContent,
            type: 'task_assigned',
            relatedId: taskId,
            read: false,
            timestamp: new Date()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'notifications');
        }
      }
    }
    
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        ...taskData,
        activityLog: [...newLogs, ...(t.activityLog || [])]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
    }
  };

  const handleArchiveTask = async (taskId: string, archived: boolean) => {
    if (!user) return;
    const t = tasks.find(task => task.id === taskId);
    if (!t) return;

    const logEntry: ActivityLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      user: user.name,
      action: archived ? 'archived task' : 'unarchived task',
      timestamp: new Date(),
    };

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        archived,
        activityLog: [logEntry, ...(t.activityLog || [])]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `notifications/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden font-sans antialiased">
      <Sidebar 
        activeChannel={activeChannel || { id: 'all', name: 'All Channels', icon: 'Hash' }} 
        onChannelSelect={setActiveChannel} 
        channels={channels}
        onManageChannels={() => setIsManageChannelsModalOpen(true)}
        user={user}
        teamMembers={teamMembers}
        onEditProfile={() => setIsProfileModalOpen(true)}
        onLogout={handleLogout}
      />
      
      <main 
        ref={containerRef}
        className={cn(
          "flex-1 flex overflow-hidden select-none",
          isResizing && "cursor-col-resize"
        )}
      >
        <div 
          style={{ width: isChatCollapsed ? '0%' : `${chatWidth}%` }}
          className={cn(
            "h-full flex flex-col shadow-2xl z-10 relative transition-all duration-300 ease-in-out",
            isChatCollapsed ? "invisible overflow-hidden" : "visible"
          )}
        >
          <ChatArea 
            channel={activeChannel || { id: 'all', name: 'All Channels', icon: 'Hash' }} 
            allMessages={messages} 
            onSendMessage={handleSendMessage} 
            notifications={notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            onCollapse={() => setIsChatCollapsed(true)}
            teamMembers={teamMembers}
            allTasks={tasks}
            onOpenTask={(id) => setOpenTaskId(id)}
          />
          
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

        {isChatCollapsed && (
          <button
            onClick={() => setIsChatCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-white border border-slate-200 shadow-lg rounded-r-xl p-2 hover:bg-slate-50 transition-all group"
            title="Expand Chat"
          >
            <div className="flex flex-col items-center gap-2">
              <PanelLeftOpen className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
              <div className="[writing-mode:vertical-lr] text-[10px] font-bold text-slate-400 uppercase tracking-widest">Messages</div>
            </div>
          </button>
        )}

        <div 
          style={{ width: isChatCollapsed ? '100%' : `${100 - chatWidth}%` }}
          className="h-full transition-all duration-300 ease-in-out"
        >
          <KanbanBoard 
            tasks={tasks} 
            activeChannel={activeChannel || { id: 'all', name: 'All Channels', icon: 'Hash' }}
            channels={channels}
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            user={user}
            teamMembers={teamMembers}
            onTaskMove={handleTaskMove} 
            onTaskReorder={handleTaskReorder}
            onAddTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onArchiveTask={handleArchiveTask}
            onDeleteTask={handleDeleteTask}
            openTaskId={openTaskId}
            onClearOpenTaskId={() => setOpenTaskId(null)}
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

