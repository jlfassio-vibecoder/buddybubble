import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Hash, Info, Search, Bell, Star, AtSign, X, Calendar as CalendarIcon, User, MessageSquare, Clock, Paperclip, PanelLeftClose, Zap, Lightbulb, CheckSquare } from 'lucide-react';
import { Message, Channel, Notification, UserProfile, Task } from '../types';
import { format, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ChatAreaProps {
  channel: Channel;
  allMessages: Message[];
  onSendMessage: (content: string, parentId?: string) => void;
  notifications: Notification[];
  onMarkNotificationRead: (id: string) => void;
  onCollapse: () => void;
  teamMembers: UserProfile[];
  allTasks: Task[];
  onOpenTask: (taskId: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ channel, allMessages, onSendMessage, notifications, onMarkNotificationRead, onCollapse, teamMembers, allTasks, onOpenTask }) => {
  const [input, setInput] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [taskMentionSearch, setTaskMentionSearch] = useState('');
  const [showTaskMentions, setShowTaskMentions] = useState(false);
  const [taskMentionIndex, setTaskMentionIndex] = useState(-1);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSender, setSearchSender] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [activeThreadParent, setActiveThreadParent] = useState<Message | null>(null);
  const [threadInput, setThreadInput] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : [];
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayMessages = useMemo(() => {
    const filtered = allMessages.filter(m => !m.parentId);
    if (channel.id === 'all') return filtered;
    return filtered.filter(m => m.department === channel.name || m.department === 'All Channels');
  }, [allMessages, channel.name, channel.id]);

  const threadMessages = useMemo(() => {
    if (!activeThreadParent) return [];
    return allMessages.filter(m => m.parentId === activeThreadParent.id);
  }, [allMessages, activeThreadParent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadMessages]);

  useEffect(() => {
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    
    // Check for @ mentions
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    if (lastAtSymbol !== -1) {
      const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n') {
        const query = textBeforeCursor.substring(lastAtSymbol + 1);
        // Only show mentions if there's no space between @ and cursor
        if (!query.includes(' ')) {
          setMentionSearch(query);
          setShowMentions(true);
          setMentionIndex(0);
          setShowTaskMentions(false);
          return;
        }
      }
    }
    setShowMentions(false);

    // Check for / task mentions
    const lastSlashSymbol = textBeforeCursor.lastIndexOf('/');
    if (lastSlashSymbol !== -1) {
      const charBeforeSlash = lastSlashSymbol > 0 ? textBeforeCursor[lastSlashSymbol - 1] : ' ';
      if (charBeforeSlash === ' ' || charBeforeSlash === '\n') {
        const query = textBeforeCursor.substring(lastSlashSymbol + 1);
        // Only show mentions if there's no space between / and cursor
        if (!query.includes(' ')) {
          setTaskMentionSearch(query);
          setShowTaskMentions(true);
          setTaskMentionIndex(0);
          return;
        }
      }
    }
    setShowTaskMentions(false);
  };

  const insertMention = (userName: string) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = input.substring(0, cursorPosition);
    const textAfterCursor = input.substring(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    const newValue = 
      textBeforeCursor.substring(0, lastAtSymbol) + 
      `@${userName} ` + 
      textAfterCursor;

    setInput(newValue);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const insertTaskMention = (taskTitle: string) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = input.substring(0, cursorPosition);
    const textAfterCursor = input.substring(cursorPosition);
    const lastSlashSymbol = textBeforeCursor.lastIndexOf('/');

    const newValue = 
      textBeforeCursor.substring(0, lastSlashSymbol) + 
      `/${taskTitle} ` + 
      textAfterCursor;

    setInput(newValue);
    setShowTaskMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
      setShowMentions(false);
    }
  };

  const filteredMembers = teamMembers.filter(member => 
    member.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const searchedMessages = useMemo(() => {
    if (!searchQuery && !searchSender && !searchDate) return [];
    
    // Parse advanced operators from searchQuery
    let cleanQuery = searchQuery;
    let fromOperator = searchSender;
    let inOperator = '';
    let hasAttachment = false;

    const fromMatch = cleanQuery.match(/from:(\w+)/);
    if (fromMatch) {
      fromOperator = fromMatch[1];
      cleanQuery = cleanQuery.replace(fromMatch[0], '').trim();
    }

    const inMatch = cleanQuery.match(/in:([\w\s&]+)/);
    if (inMatch) {
      inOperator = inMatch[1];
      cleanQuery = cleanQuery.replace(inMatch[0], '').trim();
    }

    if (cleanQuery.includes('has:attachment')) {
      hasAttachment = true;
      cleanQuery = cleanQuery.replace('has:attachment', '').trim();
    }
    
    return allMessages.filter(msg => {
      const matchesQuery = !cleanQuery || msg.content.toLowerCase().includes(cleanQuery.toLowerCase());
      const matchesSender = !fromOperator || msg.sender.toLowerCase().includes(fromOperator.toLowerCase());
      const matchesDate = !searchDate || isSameDay(new Date(msg.timestamp), new Date(searchDate));
      const matchesChannel = !inOperator || msg.department.toLowerCase().includes(inOperator.toLowerCase()) || msg.department === 'All Channels';
      const matchesAttachment = !hasAttachment || (msg.attachments && msg.attachments.length > 0);
      
      return matchesQuery && matchesSender && matchesDate && matchesChannel && matchesAttachment;
    });
  }, [allMessages, searchQuery, searchSender, searchDate]);

  const saveSearch = (query: string) => {
    if (!query.trim()) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== query);
      return [query, ...filtered].slice(0, 5);
    });
  };

  const handleOpenThread = (msg: Message) => {
    setActiveThreadParent(msg);
    // Mark related notifications as read
    notifications
      .filter(n => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read)
      .forEach(n => onMarkNotificationRead(n.id));
  };

  const renderMessageContent = (content: string) => {
    let parts: (string | React.ReactNode)[] = [content];

    // Handle @ Mentions
    if (teamMembers && teamMembers.length > 0) {
      const sortedMembers = [...teamMembers].sort((a, b) => b.name.length - a.name.length);
      const namesPattern = sortedMembers
        .map(m => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const namesRegex = new RegExp(`(@(?:${namesPattern}))`, 'g');

      parts = parts.flatMap(part => {
        if (typeof part !== 'string') return part;
        const subParts = part.split(namesRegex);
        return subParts.map((subPart, i) => {
          if (subPart.startsWith('@')) {
            const name = subPart.substring(1);
            if (teamMembers.some(m => m.name === name)) {
              return (
                <span key={`mention-${i}`} className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded border border-indigo-100">
                  {subPart}
                </span>
              );
            }
          }
          return subPart;
        });
      });
    }

    // Handle / Task Mentions
    if (allTasks && allTasks.length > 0) {
      const sortedTasks = [...allTasks].sort((a, b) => b.title.length - a.title.length);
      const titlesPattern = sortedTasks
        .map(t => t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const titlesRegex = new RegExp(`(/(?:${titlesPattern}))`, 'g');

      parts = parts.flatMap(part => {
        if (typeof part !== 'string') return part;
        const subParts = part.split(titlesRegex);
        return subParts.map((subPart, i) => {
          if (subPart.startsWith('/')) {
            const title = subPart.substring(1);
            const task = allTasks.find(t => t.title === title);
            if (task) {
              return (
                <button 
                  key={`task-${i}`} 
                  onClick={() => onOpenTask(task.id)}
                  className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors" 
                  title={`View Task: ${task.title}`}
                >
                  {subPart}
                </button>
              );
            }
          }
          return subPart;
        });
      });
    }

    return parts;
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-slate-400" />
          <h2 className="font-bold text-slate-900">{channel.name}</h2>
          <Star className="w-4 h-4 text-slate-300 hover:text-yellow-400 cursor-pointer transition-colors" />
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <Search 
            className={cn(
              "w-5 h-5 cursor-pointer transition-colors",
              isSearchOpen ? "text-indigo-600" : "hover:text-slate-900"
            )} 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          />
          <div className="relative">
            <Bell 
              className={cn(
                "w-5 h-5 cursor-pointer transition-colors",
                isNotificationsOpen ? "text-indigo-600" : "hover:text-slate-900"
              )} 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            />
            {notifications.some(n => !n.read) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
            )}
            
            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                >
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {notifications.filter(n => !n.read).length} New
                    </span>
                  </div>
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div 
                          key={n.id}
                          className={cn(
                            "p-4 border-b border-slate-50 last:border-0 transition-colors cursor-pointer hover:bg-slate-50",
                            !n.read && "bg-indigo-50/30"
                          )}
                          onClick={() => {
                            onMarkNotificationRead(n.id);
                            if (n.type === 'thread_reply') {
                              const parent = allMessages.find(m => m.id === n.relatedId);
                              if (parent) setActiveThreadParent(parent);
                            }
                            setIsNotificationsOpen(false);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-slate-900 mb-1">{n.title}</p>
                              <p className="text-[11px] text-slate-600 leading-relaxed">{n.content}</p>
                              <p className="text-[10px] text-slate-400 mt-2">{format(n.timestamp, 'MMM d, h:mm a')}</p>
                            </div>
                            {!n.read && <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1 shrink-0" />}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No notifications yet.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Info className="w-5 h-5 cursor-pointer hover:text-slate-900" />
          <button 
            onClick={onCollapse}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-all"
            title="Collapse Chat"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50 border-b border-slate-200 overflow-hidden shrink-0"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search Messages
                </h3>
                <button 
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                    setSearchSender('');
                    setSearchDate('');
                  }}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveSearch(searchQuery);
                    }}
                    placeholder="Search or use operators (from:, in:, has:attachment)..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchSender}
                    onChange={(e) => setSearchSender(e.target.value)}
                    placeholder="Sender..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Recent Searches */}
              {!searchQuery && !searchSender && !searchDate && recentSearches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Recent Searches
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setSearchQuery(s)}
                        className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        {s}
                        <X 
                          className="w-3 h-3 text-slate-300 hover:text-red-500" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecentSearches(prev => prev.filter(item => item !== s));
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {(searchQuery || searchSender || searchDate) && (
                <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {searchedMessages.length} Results Found
                    </span>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-slate-400 italic">Tip: use from:user or in:channel</span>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {searchedMessages.length > 0 ? (
                      searchedMessages.map((msg) => (
                        <div 
                          key={msg.id}
                          className="p-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors cursor-pointer"
                          onClick={() => {
                            // In a real app, we'd scroll to this message
                            // For now, just close search
                            setIsSearchOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{msg.sender}</span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">#{msg.department}</span>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <Paperclip className="w-3 h-3 text-indigo-400" />
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{format(msg.timestamp, 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {renderMessageContent(msg.content)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No messages match your search.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 flex overflow-hidden">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
        >
          <AnimatePresence initial={false}>
            {displayMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 group relative",
                  activeThreadParent?.id === msg.id && "bg-indigo-50/50 -mx-6 px-6 py-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
                  {msg.senderAvatar ? (
                    <img src={msg.senderAvatar} alt={msg.sender} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    msg.sender[0]
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-900">{msg.sender}</span>
                    {msg.department === 'All Channels' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-bold border border-indigo-100">
                        All Channels
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {format(msg.timestamp, 'h:mm a')}
                    </span>
                  </div>
                  <div className="text-slate-700 leading-relaxed mt-0.5">
                    {renderMessageContent(msg.content)}
                  </div>
                  
                  {/* Thread Indicator */}
                  {msg.threadCount && msg.threadCount > 0 ? (
                    <button 
                      onClick={() => handleOpenThread(msg)}
                      className="mt-2 flex items-center gap-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100"
                    >
                      <MessageSquare className="w-3 h-3" />
                      {msg.threadCount} {msg.threadCount === 1 ? 'reply' : 'replies'}
                      {notifications.some(n => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read) && (
                        <span className="px-1 py-0.5 bg-red-500 text-white text-[7px] rounded-full uppercase tracking-tighter animate-pulse">
                          New
                        </span>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleOpenThread(msg)}
                      className="mt-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-all"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Reply in thread
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Thread Panel */}
        <AnimatePresence>
          {activeThreadParent && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col shadow-2xl z-10"
            >
              <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Thread</h3>
                </div>
                <button 
                  onClick={() => setActiveThreadParent(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={threadScrollRef}>
                {/* Parent Message */}
                <div className="mb-6 pb-6 border-b border-slate-200">
                  <div className="flex gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
                      {activeThreadParent.senderAvatar ? (
                        <img src={activeThreadParent.senderAvatar} alt={activeThreadParent.sender} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        activeThreadParent.sender[0]
                      )}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-slate-900">{activeThreadParent.sender}</span>
                        <span className="text-[10px] text-slate-400">{format(activeThreadParent.timestamp, 'h:mm a')}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{renderMessageContent(activeThreadParent.content)}</p>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                <div className="space-y-6">
                  {threadMessages.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
                        {reply.senderAvatar ? (
                          <img src={reply.senderAvatar} alt={reply.sender} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          reply.sender[0]
                        )}
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-slate-900">{reply.sender}</span>
                          <span className="text-[10px] text-slate-400">{format(reply.timestamp, 'h:mm a')}</span>
                        </div>
                        <p className="text-sm text-slate-700 mt-1">{renderMessageContent(reply.content)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thread Input */}
              <div className="p-4 bg-white border-t border-slate-200">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (threadInput.trim()) {
                      onSendMessage(threadInput, activeThreadParent.id);
                      setThreadInput('');
                    }
                  }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={threadInput}
                    onChange={(e) => setThreadInput(e.target.value)}
                    placeholder="Reply to thread..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!threadInput.trim()}
                    className="absolute right-1.5 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mention Suggestions */}
      <AnimatePresence>
        {showMentions && filteredMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 left-6 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <AtSign className="w-3 h-3 text-indigo-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mention Team Member</span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {filteredMembers.map((member, idx) => (
                <button
                  key={member.id}
                  onClick={() => insertMention(member.name)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    idx === mentionIndex ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                    {member.name[0]}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{member.name}</span>
                    <span className="text-[10px] text-slate-400">{member.email}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {showTaskMentions && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 left-6 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Hash className="w-3 h-3 text-emerald-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Link Task / Feature</span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {allTasks.filter(t => t.title.toLowerCase().includes(taskMentionSearch.toLowerCase())).length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-400">No tasks found</p>
                </div>
              ) : (
                allTasks
                  .filter(t => t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()))
                  .map((task, idx) => (
                    <button
                      key={task.id}
                      onClick={() => insertTaskMention(task.title)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        idx === taskMentionIndex ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="w-7 h-7 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-bold shrink-0">
                        {task.type === 'request' ? <Zap className="w-3 h-3" /> : task.type === 'idea' ? <Lightbulb className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate">{task.title}</span>
                        <span className="text-[10px] text-slate-400 truncate">{task.status}</span>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-6 pt-0">
        <form 
          onSubmit={handleSubmit}
          className="relative flex items-center"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (showMentions && filteredMembers.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex(prev => (prev + 1) % filteredMembers.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  insertMention(filteredMembers[mentionIndex].name);
                } else if (e.key === 'Escape') {
                  setShowMentions(false);
                }
              } else if (showTaskMentions) {
                const filtered = allTasks.filter(t => t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()));
                if (filtered.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setTaskMentionIndex(prev => (prev + 1) % filtered.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setTaskMentionIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    if (filtered[taskMentionIndex]) {
                      insertTaskMention(filtered[taskMentionIndex].title);
                    }
                  }
                }
                if (e.key === 'Escape') {
                  setShowTaskMentions(false);
                }
              }
            }}
            placeholder={channel.id === 'all' ? "Message in All Channels..." : `Message #${channel.name}`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-2 px-1">
          <b>Return</b> to send • <b>Shift + Return</b> for new line • <b>@</b> to mention
          {channel.id === 'all' && <span className="ml-2 text-indigo-500 font-bold">• Broadcast to all channels</span>}
        </p>
      </div>
    </div>
  );
};
