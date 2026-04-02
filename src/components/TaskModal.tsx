import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, CheckSquare, Square, Plus, Trash2, History, ArrowRight, Tag, Paperclip, FileText, Download, Hash, AlertCircle, Copy, Save, Sparkles, Loader2, Search, Lightbulb, Zap, Brain } from 'lucide-react';
import { Task, Comment, Subtask, ActivityLogEntry, Attachment, Channel, UserProfile, TaskTemplate, TaskType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { Link2 } from 'lucide-react';
import { hasPermission } from '../lib/permissions';
import { GoogleGenAI } from "@google/genai";
import { storage, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>) => void;
  onAddTask?: (task: Omit<Task, 'id' | 'status' | 'createdAt' | 'activityLog'>) => string;
  onDeleteTask?: (taskId: string) => void;
  initialTask?: Task | null;
  allTasks: Task[];
  activeChannel: Channel;
  channels: Channel[];
  templates: TaskTemplate[];
  onSaveTemplate: (template: Omit<TaskTemplate, 'id'>) => void;
  user: UserProfile;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit, onAddTask, onDeleteTask, initialTask, allTasks, activeChannel, channels, templates, onSaveTemplate, user }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('task');
  // Feature Request fields
  const [impact, setImpact] = useState<Task['impact']>('Medium');
  const [urgency, setUrgency] = useState<Task['urgency']>('Medium');
  const [userStory, setUserStory] = useState('');
  // Idea fields
  const [category, setCategory] = useState('');
  const [potentialValue, setPotentialValue] = useState('');
  const [upvotes, setUpvotes] = useState<string[]>([]);
  const [assignee, setAssignee] = useState('');
  const [assigner, setAssigner] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('Medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [channelId, setChannelId] = useState<string>(activeChannel.id);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [relatedTaskIds, setRelatedTaskIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [rightSidebarTab, setRightSidebarTab] = useState<'comments' | 'activity'>('comments');
  const [newDependencyTitle, setNewDependencyTitle] = useState('');
  const [isAddingDependency, setIsAddingDependency] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = hasPermission(user.role, 'EDIT_TASK');
  const canAssign = hasPermission(user.role, 'ASSIGN_TASK');
  const canDelete = hasPermission(user.role, 'DELETE_TASK');
  const canCreate = hasPermission(user.role, 'CREATE_TASK');

  const isReadOnly = initialTask ? !canEdit : !canCreate;

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setTaskType(initialTask.type || 'task');
      setImpact(initialTask.impact || 'Medium');
      setUrgency(initialTask.urgency || 'Medium');
      setUserStory(initialTask.userStory || '');
      setCategory(initialTask.category || '');
      setPotentialValue(initialTask.potentialValue || '');
      setUpvotes(initialTask.upvotes || []);
      setAssignee(initialTask.assignee);
      setAssigner(initialTask.assigner || '');
      setPriority(initialTask.priority);
      setDueDate(initialTask.dueDate ? new Date(initialTask.dueDate).toISOString().split('T')[0] : '');
      setChannelId(initialTask.channelId || (activeChannel.id === 'all' ? (channels[0]?.id || '') : activeChannel.id));
      setComments(initialTask.comments || []);
      setSubtasks(initialTask.subtasks || []);
      setDependencies(initialTask.dependencies || []);
      setRelatedTaskIds(initialTask.relatedTaskIds || []);
      setTags(initialTask.tags || []);
      setAttachments(initialTask.attachments || []);
      setActivityLog(initialTask.activityLog || []);
    } else {
      setTitle('');
      setDescription('');
      setTaskType('task');
      setImpact('Medium');
      setUrgency('Medium');
      setUserStory('');
      setCategory('');
      setPotentialValue('');
      setUpvotes([]);
      setAssignee('');
      setAssigner('');
      setPriority('Medium');
      setDueDate('');
      setChannelId(activeChannel.id === 'all' ? (channels[0]?.id || '') : activeChannel.id);
      setComments([]);
      setSubtasks([]);
      setDependencies([]);
      setRelatedTaskIds([]);
      setTags([]);
      setAttachments([]);
      setActivityLog([]);
    }
    setNewComment('');
    setNewSubtask('');
    setRightSidebarTab('comments');
    setNewDependencyTitle('');
    setNewTag('');
    setIsAddingDependency(false);
    setShowTemplates(false);
  }, [initialTask, isOpen]);

  const handleGoogleSearch = async () => {
    if (!title.trim()) {
      alert('Please enter a title first to search for details.');
      return;
    }
    
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Research and provide a concise but informative description for a task titled: "${title}". Focus on practical steps, context, and key details. If it's a specific technical or professional topic, include relevant industry context.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      const text = response.text;
      if (text) {
        setDescription(text);
      }
    } catch (error) {
      console.error("Error searching Google:", error);
      alert("Failed to search Google. Please check your title and try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpvote = () => {
    if (!user.id) return;
    
    const isUpvoted = upvotes.includes(user.id);
    const newUpvotes = isUpvoted 
      ? upvotes.filter(id => id !== user.id)
      : [...upvotes, user.id];
    
    setUpvotes(newUpvotes);
    
    // Automatic priority adjustment for Feature Requests
    if (taskType === 'request') {
      const count = newUpvotes.length;
      if (count >= 10) {
        setPriority('High');
      } else if (count >= 5) {
        setPriority('Medium');
      } else if (count > 0) {
        setPriority('Low');
      }
    }
  };

  const applyTemplate = (template: TaskTemplate) => {
    setTitle(template.title);
    setDescription(template.description);
    setPriority(template.priority);
    setTags(template.tags || []);
    setSubtasks((template.subtasks || []).map(s => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      title: s.title, 
      completed: s.completed 
    })));
    if (template.channelId) setChannelId(template.channelId);
    setShowTemplates(false);
  };

  const handleSaveAsTemplate = () => {
    if (!title.trim()) {
      alert('Please enter a title before saving as a template.');
      return;
    }
    const templateName = window.prompt('Enter a name for this template:');
    if (templateName) {
      onSaveTemplate({
        name: templateName,
        title,
        description,
        priority,
        tags,
        subtasks: subtasks.map(({ title, completed }) => ({ title, completed })),
        channelId,
      });
    }
  };

  const handleAddDependency = () => {
    if (!newDependencyTitle.trim() || !onAddTask) return;
    
    const newTaskId = onAddTask({
      title: newDependencyTitle,
      description: 'Created as a dependency',
      assignee: assignee || 'Unassigned',
      assigner: 'John Doe', // Mock current user
      priority: 'Medium',
      dueDate: undefined,
      comments: [],
      subtasks: [],
      dependencies: []
    });
    
    setDependencies([...dependencies, newTaskId]);
    setNewDependencyTitle('');
    setIsAddingDependency(false);
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    if (tags.includes(newTag.trim())) {
      setNewTag('');
      return;
    }
    setTags([...tags, newTag.trim()]);
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    setIsUploading(true);
    try {
      const newAttachments: Attachment[] = [];
      
      const fileList = Array.from(files) as File[];
      for (const file of fileList) {
        const fileId = Math.random().toString(36).substr(2, 9);
        const storageRef = ref(storage, `tasks/${user.id}/${fileId}_${file.name}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        newAttachments.push({
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          url: downloadURL,
          timestamp: new Date(),
          storagePath: storageRef.fullPath
        });
      }

      setAttachments([...attachments, ...newAttachments]);
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("Failed to upload files. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (id: string) => {
    const attachmentToRemove = attachments.find(a => a.id === id);
    if (attachmentToRemove?.storagePath) {
      try {
        const storageRef = ref(storage, attachmentToRemove.storagePath);
        await deleteObject(storageRef);
      } catch (error) {
        console.error("Error deleting file from storage:", error);
      }
    }
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const comment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      author: 'John Doe', // Mock current user
      text: newComment,
      timestamp: new Date(),
    };
    
    setComments([...comments, comment]);
    setNewComment('');
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    
    const subtask: Subtask = {
      id: Math.random().toString(36).substr(2, 9),
      title: newSubtask,
      completed: false,
    };
    
    setSubtasks([...subtasks, subtask]);
    setNewSubtask('');
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const deleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const progressPercentage = subtasks.length > 0 
    ? Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100) 
    : 0;

  const blockedBy = dependencies
    .map(depId => allTasks.find(t => t.id === depId))
    .filter(t => t && t.status !== 'Done') as Task[];

  const isBlocked = blockedBy.length > 0;

  const toggleDependency = (taskId: string) => {
    setDependencies(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId) 
        : [...prev, taskId]
    );
  };

  const toggleRelatedTask = (taskId: string) => {
    setRelatedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId) 
        : [...prev, taskId]
    );
  };

  const handleDelete = () => {
    if (initialTask && onDeleteTask) {
      onDeleteTask(initialTask.id);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && assignee.trim()) {
      const taskData: any = { 
        title, 
        description, 
        type: taskType,
        upvotes,
        assignee, 
        priority,
        channelId,
        comments,
        subtasks,
        dependencies,
        relatedTaskIds,
        tags,
        attachments
      };

      if (assigner.trim()) taskData.assigner = assigner.trim();
      if (dueDate) taskData.dueDate = new Date(dueDate);

      if (taskType === 'request') {
        taskData.impact = impact;
        taskData.urgency = urgency;
        taskData.userStory = userStory;
      } else if (taskType === 'idea') {
        taskData.category = category;
        taskData.potentialValue = potentialValue;
      }

      if (initialTask?.position !== undefined) {
        taskData.position = initialTask.position;
      }

      onSubmit(taskData);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  {taskType === 'request' && <Zap className="w-5 h-5 text-purple-500" />}
                  {taskType === 'idea' && <Lightbulb className="w-5 h-5 text-emerald-500" />}
                  {(!taskType || taskType === 'task') && <CheckSquare className="w-5 h-5 text-indigo-500" />}
                  {initialTask ? `Edit ${taskType === 'request' ? 'Request' : taskType === 'idea' ? 'Idea' : 'Task'}` : `Create New ${taskType === 'request' ? 'Request' : taskType === 'idea' ? 'Idea' : 'Task'}`}
                </h3>
                {!initialTask && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTemplates(!showTemplates)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors text-xs font-semibold"
                    >
                      <Copy className="w-3 h-3" />
                      Templates
                    </button>
                    
                    <AnimatePresence>
                      {showTemplates && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowTemplates(false)} 
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 z-20 py-2 overflow-hidden"
                          >
                            <div className="px-3 py-1.5 border-b border-slate-50 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select a Template</span>
                            </div>
                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                              {templates.length === 0 ? (
                                <p className="px-4 py-3 text-xs text-slate-400 text-center italic">No templates saved yet.</p>
                              ) : (
                                templates.map(template => (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => applyTemplate(template)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors group"
                                  >
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                      <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">{template.name}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 line-clamp-1">{template.description}</p>
                                  </button>
                                ))
                              )}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {isBlocked && initialTask?.status !== 'Done' && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200 animate-pulse">
                    <Link2 className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Blocked</span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col md:flex-row">
                {/* Main Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 border-b md:border-b-0 md:border-r border-slate-100">
                  {isReadOnly && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl mb-4">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-xs text-amber-700 font-medium">
                        You don't have permission to {initialTask ? 'edit' : 'create'} tasks.
                      </p>
                    </div>
                  )}

                  {/* Type Selector */}
                  <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl mb-6">
                    <button
                      type="button"
                      onClick={() => setTaskType('task')}
                      disabled={isReadOnly}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                        taskType === 'task' 
                          ? "bg-white text-indigo-600 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <CheckSquare className="w-4 h-4" />
                      Task
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskType('request')}
                      disabled={isReadOnly}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                        taskType === 'request' 
                          ? "bg-white text-indigo-600 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <Zap className="w-4 h-4" />
                      Feature Request
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskType('idea')}
                      disabled={isReadOnly}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                        taskType === 'idea' 
                          ? "bg-white text-indigo-600 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <Lightbulb className="w-4 h-4" />
                      Idea
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      {taskType === 'task' ? 'Title' : taskType === 'request' ? 'Feature Name' : 'Idea Summary'}
                    </label>
                    <input
                      autoFocus
                      type="text"
                      required
                      disabled={isReadOnly}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={taskType === 'task' ? "What needs to be done?" : taskType === 'request' ? "What feature are we requesting?" : "What's on your mind?"}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
                    />
                  </div>

                  {/* Conditional Fields for Feature Request */}
                  {taskType === 'request' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 pt-2"
                    >
                      <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Zap className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{upvotes.length} Upvotes</p>
                            <p className="text-[10px] text-slate-500">Priority adjusts based on upvote count</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleUpvote}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                            upvotes.includes(user.id)
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                              : "bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50"
                          )}
                        >
                          <ArrowRight className={cn("w-3.5 h-3.5 transition-transform", upvotes.includes(user.id) ? "-rotate-90" : "-rotate-90")} />
                          {upvotes.includes(user.id) ? 'Upvoted' : 'Upvote'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Impact</label>
                          <select
                            disabled={isReadOnly}
                            value={impact}
                            onChange={(e) => setImpact(e.target.value as Task['impact'])}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          >
                            <option value="Low">Low Impact</option>
                            <option value="Medium">Medium Impact</option>
                            <option value="High">High Impact</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Urgency</label>
                          <select
                            disabled={isReadOnly}
                            value={urgency}
                            onChange={(e) => setUrgency(e.target.value as Task['urgency'])}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          >
                            <option value="Low">Low Urgency</option>
                            <option value="Medium">Medium Urgency</option>
                            <option value="High">High Urgency</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">User Story</label>
                        <textarea
                          disabled={isReadOnly}
                          value={userStory}
                          onChange={(e) => setUserStory(e.target.value)}
                          placeholder="As a [user type], I want to [action] so that [benefit]..."
                          rows={2}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Conditional Fields for Idea */}
                  {taskType === 'idea' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 pt-2"
                    >
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          placeholder="e.g., UX Improvement, New Revenue Stream..."
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Potential Value</label>
                        <textarea
                          disabled={isReadOnly}
                          value={potentialValue}
                          onChange={(e) => setPotentialValue(e.target.value)}
                          placeholder="Why is this idea worth pursuing?"
                          rows={2}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-semibold text-slate-700">Description</label>
                      <button
                        type="button"
                        onClick={handleGoogleSearch}
                        disabled={isReadOnly || isSearching || !title.trim()}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all",
                          isSearching 
                            ? "bg-indigo-100 text-indigo-600 animate-pulse" 
                            : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100"
                        )}
                      >
                        {isSearching ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {isSearching ? 'Searching...' : 'AI Search & Fill'}
                      </button>
                    </div>
                    <textarea
                      disabled={isReadOnly || isSearching}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={isSearching ? "AI is researching and writing..." : "Add more details..."}
                      rows={4}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none disabled:opacity-60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Assignee</label>
                      <input
                        type="text"
                        required
                        disabled={isReadOnly || !canAssign}
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        placeholder="Name"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Priority</label>
                      <select
                        disabled={isReadOnly}
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as Task['priority'])}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none disabled:opacity-60"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned By</label>
                    <input
                      type="text"
                      disabled={isReadOnly || !canAssign}
                      value={assigner}
                      onChange={(e) => setAssigner(e.target.value)}
                      placeholder="Who assigned this task?"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Channel Association</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        disabled={isReadOnly}
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none disabled:opacity-60"
                      >
                        {channels.map(channel => (
                          <option key={channel.id} value={channel.id}>
                            {channel.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tags Section */}
                  <div className="pt-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Tags</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {tags.map((tag) => (
                        <span 
                          key={tag} 
                          className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md border border-indigo-100 group"
                        >
                          {tag}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder="Add a tag..."
                            className="w-full pl-10 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTag();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddTag}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Attachments Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">Attachments</label>
                      {!isReadOnly && (
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full transition-colors",
                            isUploading && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isUploading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Paperclip className="w-3 h-3" />
                          )}
                          {isUploading ? 'Uploading...' : 'Attach File'}
                        </button>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        multiple
                      />
                    </div>

                    <div className="space-y-2">
                      {attachments.length > 0 ? (
                        attachments.map((file) => (
                          <div 
                            key={file.id} 
                            className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-lg group hover:border-indigo-200 transition-colors"
                          >
                            <div className="p-2 bg-white rounded-md border border-slate-100 text-indigo-500">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400">{formatFileSize(file.size)} • {format(new Date(file.timestamp), 'MMM d')}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a 
                                href={file.url} 
                                download={file.name}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(file.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 border-2 border-dashed border-slate-100 rounded-xl">
                          <p className="text-[10px] text-slate-400">No files attached yet.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subtasks Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                        <label className="block text-sm font-semibold text-slate-700">Subtasks</label>
                      </div>
                      {subtasks.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-400">
                            {subtasks.filter(s => s.completed).length} of {subtasks.length} completed
                          </span>
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {progressPercentage}%
                          </span>
                        </div>
                      )}
                    </div>

                    {subtasks.length > 0 && (
                      <div className="w-full h-2.5 bg-slate-100 rounded-full mb-4 overflow-hidden shadow-inner border border-slate-200/50">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercentage}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600 rounded-full shadow-sm relative"
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </motion.div>
                      </div>
                    )}

                    <div className="space-y-2 mb-3">
                      {subtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center gap-2 group hover:bg-slate-50 p-1 rounded-lg transition-colors">
                          <label className={cn(
                            "flex items-center gap-2 flex-1",
                            !isReadOnly ? "cursor-pointer" : "cursor-default"
                          )}>
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={subtask.completed}
                              onChange={() => toggleSubtask(subtask.id)}
                              className="sr-only"
                            />
                            <div className={cn(
                              "transition-all duration-200 shrink-0",
                              subtask.completed ? "text-indigo-600 scale-110" : "text-slate-300 group-hover:text-slate-400"
                            )}>
                              {subtask.completed ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </div>
                            <span className={cn(
                              "text-sm flex-1 transition-all duration-200",
                              subtask.completed ? "text-slate-400 line-through" : "text-slate-700"
                            )}>
                              {subtask.title}
                            </span>
                          </label>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => deleteSubtask(subtask.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                          placeholder="Add a subtask..."
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddSubtask();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddSubtask}
                          className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dependencies Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">Dependencies (Blocked by)</label>
                      <div className="flex items-center gap-2">
                        {dependencies.length > 0 && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            {dependencies.length} Linked
                          </span>
                        )}
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => setIsAddingDependency(!isAddingDependency)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full transition-colors"
                          >
                            {isAddingDependency ? 'Cancel' : '+ New Task'}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && isAddingDependency && (
                      <div className="mb-3 flex items-center gap-2 p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                        <input
                          type="text"
                          value={newDependencyTitle}
                          onChange={(e) => setNewDependencyTitle(e.target.value)}
                          placeholder="Dependency title..."
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDependency();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddDependency}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                      {allTasks
                        .filter(t => t.id !== initialTask?.id)
                        .map(task => (
                          <label key={task.id} className={cn(
                            "flex items-center gap-2 group",
                            !isReadOnly ? "cursor-pointer" : "cursor-default"
                          )}>
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={dependencies.includes(task.id)}
                              onChange={() => toggleDependency(task.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex flex-col">
                              <span className={cn(
                                "text-sm font-medium transition-colors",
                                dependencies.includes(task.id) ? "text-indigo-600" : "text-slate-600 group-hover:text-slate-900"
                              )}>
                                {task.title}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Status: {task.status} • Assignee: {task.assignee}
                              </span>
                            </div>
                          </label>
                        ))}
                      {allTasks.filter(t => t.id !== initialTask?.id).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">No other tasks available.</p>
                      )}
                    </div>
                  </div>

                  {/* Blocked by Section (Derived) */}
                  {initialTask && isBlocked && initialTask.status !== 'Done' && (
                    <div className="pt-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 text-amber-600">Blocked by:</label>
                      <div className="bg-amber-50/30 border border-amber-100 rounded-lg p-3 space-y-2">
                        {blockedBy.map(task => (
                          <div key={task.id} className="flex items-center gap-2">
                            <Link2 className="w-3 h-3 text-amber-400" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-700">{task.title}</span>
                              <span className="text-[10px] text-slate-400">Status: {task.status} • Assignee: {task.assignee}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blocking Section (Derived) */}
                  {initialTask && (
                    <div className="pt-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 text-indigo-600">This task blocks:</label>
                      <div className="bg-indigo-50/30 border border-indigo-100 rounded-lg p-3 space-y-2">
                        {allTasks.filter(t => t.dependencies?.includes(initialTask.id)).length > 0 ? (
                          allTasks
                            .filter(t => t.dependencies?.includes(initialTask.id))
                            .map(task => (
                              <div key={task.id} className="flex items-center gap-2">
                                <Link2 className="w-3 h-3 text-indigo-400 rotate-180" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-slate-700">{task.title}</span>
                                  <span className="text-[10px] text-slate-400">Status: {task.status}</span>
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="text-xs text-slate-400 text-center py-1 italic">This task is not blocking any others.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Related Tasks Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">Related Tasks</label>
                      {relatedTaskIds.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {relatedTaskIds.length} Linked
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                      {allTasks
                        .filter(t => t.id !== initialTask?.id)
                        .map(task => (
                          <label key={task.id} className={cn(
                            "flex items-center gap-2 group",
                            !isReadOnly ? "cursor-pointer" : "cursor-default"
                          )}>
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={relatedTaskIds.includes(task.id)}
                              onChange={() => toggleRelatedTask(task.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex flex-col">
                              <span className={cn(
                                "text-sm font-medium transition-colors",
                                relatedTaskIds.includes(task.id) ? "text-indigo-600" : "text-slate-600 group-hover:text-slate-900"
                              )}>
                                {task.title}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Status: {task.status} • Assignee: {task.assignee}
                              </span>
                            </div>
                          </label>
                        ))}
                      {allTasks.filter(t => t.id !== initialTask?.id).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">No other tasks available.</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    {initialTask && canDelete && (
                      <button
                        type="button"
                        onClick={() => setIsDeleting(true)}
                        className="px-4 py-2.5 border border-red-200 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    {!isReadOnly && (
                      <div className="flex-1 flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                          {taskType === 'request' && <Zap className="w-4 h-4" />}
                          {taskType === 'idea' && <Lightbulb className="w-4 h-4" />}
                          {(!taskType || taskType === 'task') && <CheckSquare className="w-4 h-4" />}
                          {initialTask ? `Update ${taskType === 'request' ? 'Request' : taskType === 'idea' ? 'Idea' : 'Task'}` : `Create ${taskType === 'request' ? 'Request' : taskType === 'idea' ? 'Idea' : 'Task'}`}
                        </button>
                        {!initialTask && (
                          <button
                            type="button"
                            onClick={handleSaveAsTemplate}
                            title="Save as Template"
                            className="px-3 py-2.5 bg-white border border-indigo-200 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition-all active:scale-[0.98]"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </form>

                {/* Right Sidebar: Comments & Activity */}
                <div className="w-full md:w-80 p-6 bg-slate-50 flex flex-col relative overflow-hidden">
                  {/* Delete Confirmation Overlay */}
                  <AnimatePresence>
                    {isDeleting && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[70] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-6"
                      >
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                          className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center"
                        >
                          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 className="w-6 h-6" />
                          </div>
                          <h4 className="text-lg font-bold text-slate-900 mb-2">Delete Task?</h4>
                          <p className="text-sm text-slate-500 mb-6">
                            This action cannot be undone. All comments and activity for this task will be permanently removed.
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setIsDeleting(false)}
                              className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleDelete}
                              className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex items-center gap-1 mb-4 p-1 bg-slate-200/50 rounded-lg shrink-0">
                    <button
                      onClick={() => setRightSidebarTab('comments')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all",
                        rightSidebarTab === 'comments' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Comments
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('activity')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all",
                        rightSidebarTab === 'activity' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <History className="w-3.5 h-3.5" />
                      Activity
                    </button>
                  </div>

                  {rightSidebarTab === 'comments' ? (
                    <>
                      <div className="flex-1 space-y-4 mb-4 overflow-y-auto max-h-[300px] md:max-h-none pr-2 custom-scrollbar">
                        {comments.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-xs text-slate-400">No comments yet.</p>
                          </div>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-900">{comment.author}</span>
                                <span className="text-[10px] text-slate-400">
                                  {format(new Date(comment.timestamp), 'MMM d, h:mm a')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{comment.text}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="relative mt-auto">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Write a comment..."
                          rows={2}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none pr-10"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment();
                            }
                          }}
                        />
                        <button
                          onClick={handleAddComment}
                          disabled={!newComment.trim()}
                          className="absolute right-2 bottom-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-30 transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 space-y-4 overflow-y-auto max-h-[300px] md:max-h-none pr-2 custom-scrollbar">
                      {activityLog.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-xs text-slate-400">No activity recorded yet.</p>
                        </div>
                      ) : (
                        activityLog.map((log) => (
                          <div key={log.id} className="relative pl-6 pb-4 border-l border-slate-200 last:pb-0">
                            <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white shadow-sm" />
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-900">{log.user}</span>
                                <span className="text-[9px] text-slate-400">
                                  {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600">
                                {log.action}
                                {log.field && !log.action.includes(log.field) && (
                                  <span className="font-semibold text-slate-900"> {log.field}</span>
                                )}
                              </p>
                              {log.oldValue !== undefined && log.newValue !== undefined && !log.action.includes(log.oldValue) && (
                                <div className="flex items-center gap-1.5 mt-0.5 bg-slate-100/50 p-1 rounded border border-slate-200/50">
                                  <span className="text-[9px] text-slate-400 line-through truncate max-w-[80px]">{log.oldValue}</span>
                                  <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                                  <span className="text-[9px] text-indigo-600 font-medium truncate max-w-[80px]">{log.newValue}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
