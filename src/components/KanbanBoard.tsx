import React, { useState, useEffect } from 'react';
import { Plus, MoreHorizontal, Clock, User, Filter, Edit2, Calendar, MessageSquare, CheckSquare, GripVertical, AlertCircle, AlertTriangle, Info, Link2, ArrowUpDown, Paperclip, Zap, Lightbulb, Eye, Copy, Layout, Maximize2, Minimize2, CheckCircle2, Square } from 'lucide-react';
import { Task, Channel, UserProfile, TaskTemplate } from '../types';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { TaskModal } from './TaskModal';
import { format, isPast, isToday } from 'date-fns';
import { hasPermission } from '../lib/permissions';
import { AnimatePresence } from 'motion/react';

export type CardViewMode = 'summary' | 'full' | 'detailed';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanBoardProps {
  tasks: Task[];
  activeChannel: Channel;
  channels: Channel[];
  templates: TaskTemplate[];
  onSaveTemplate: (template: Omit<TaskTemplate, 'id'>) => void;
  user: UserProfile;
  onTaskMove: (taskId: string, newStatus: Task['status'], newPosition?: number) => void;
  onTaskReorder: (taskId: string, newPosition: number, columnTasks: Task[]) => void;
  onAddTask: (task: Omit<Task, 'id' | 'status'>) => void;
  onUpdateTask: (taskId: string, task: Omit<Task, 'id' | 'status'>) => void;
  onDeleteTask: (taskId: string) => void;
}

const COLUMNS: Task['status'][] = ['Todo', 'In Progress', 'Done'];
const PRIORITIES: (Task['priority'] | 'All')[] = ['All', 'High', 'Medium', 'Low'];

interface SortableTaskCardProps {
  task: Task;
  allTasks: Task[];
  onEdit: (task: Task) => void;
  viewMode: CardViewMode;
  onViewModeChange: (mode: CardViewMode) => void;
  onQuickView: (task: Task) => void;
  onDetailedView: (task: Task) => void;
  onSummaryView: (task: Task) => void;
}

const SortableTaskCard: React.FC<SortableTaskCardProps> = ({ task, allTasks, onEdit, viewMode: globalViewMode, onViewModeChange, onQuickView, onDetailedView, onSummaryView }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [localViewMode, setLocalViewMode] = useState<CardViewMode | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const viewMode = localViewMode || globalViewMode;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isMenuOpen,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const blockedBy = (task.dependencies || [])
    .map(depId => allTasks.find(t => t.id === depId))
    .filter(t => t && t.status !== 'Done') as Task[];

  const blocks = allTasks.filter(t => t.dependencies?.includes(task.id));
  const relatedTasks = (task.relatedTaskIds || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean) as Task[];

  const isBlocked = blockedBy.length > 0;

  const handleCopyDetails = () => {
    const details = `Task: ${task.title}\nDescription: ${task.description}\nStatus: ${task.status}\nPriority: ${task.priority}`;
    navigator.clipboard.writeText(details);
    setIsMenuOpen(false);
  };

  const lastComment = task.comments && task.comments.length > 0 
    ? task.comments[task.comments.length - 1] 
    : null;

  const formatDateSafe = (date: any) => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return '';
      return format(d, 'MMM d');
    } catch (e) {
      return '';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onQuickView(task)}
      className={cn(
        "bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all group relative border-l-4 cursor-grab active:cursor-grabbing overflow-visible",
        task.status === 'Todo' ? "border-l-yellow-400" :
        task.status === 'In Progress' ? "border-l-orange-500" :
        "border-l-green-500",
        isDragging && "z-50 ring-2 ring-indigo-500 ring-offset-2 opacity-0",
        isBlocked && task.status !== 'Done' && "opacity-75",
        viewMode === 'summary' ? "p-3" : "p-4"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 -ml-1 text-slate-300 hover:text-slate-500">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
            task.status === 'Todo' ? "bg-yellow-100 text-yellow-700" :
            task.status === 'In Progress' ? "bg-orange-100 text-orange-700" :
            "bg-green-100 text-green-700"
          )}>
            {task.status}
          </div>
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
            task.priority === 'High' ? "bg-red-100 text-red-700" :
            task.priority === 'Medium' ? "bg-amber-100 text-amber-700" :
            "bg-blue-100 text-blue-700"
          )}>
            {task.priority === 'High' && <AlertCircle className="w-3 h-3" />}
            {task.priority === 'Medium' && <AlertTriangle className="w-3 h-3" />}
            {task.priority === 'Low' && <Info className="w-3 h-3" />}
            {task.priority}
          </div>
          {viewMode !== 'summary' && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
              task.type === 'request' ? "bg-purple-100 text-purple-700" :
              task.type === 'idea' ? "bg-emerald-100 text-emerald-700" :
              "bg-slate-100 text-slate-700"
            )}>
              {task.type === 'request' && <Zap className="w-3 h-3" />}
              {task.type === 'idea' && <Lightbulb className="w-3 h-3" />}
              {(!task.type || task.type === 'task') && <CheckSquare className="w-3 h-3" />}
              {task.type || 'task'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative" onPointerDown={e => e.stopPropagation()}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className={cn(
                "p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors",
                isMenuOpen && "bg-slate-100 text-slate-600"
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-[100] py-1 overflow-hidden"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">View Options</div>
                  <button 
                    onClick={() => { onQuickView(task); setIsMenuOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5" /> Quick View
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSummaryView(task); setIsMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2",
                      viewMode === 'summary' ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Minimize2 className="w-3.5 h-3.5" /> Summary View
                  </button>
                  <button 
                    onClick={() => { setLocalViewMode('full'); setIsMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2",
                      viewMode === 'full' ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Layout className="w-3.5 h-3.5" /> Full View
                  </button>
                  <button 
                    onClick={() => { onDetailedView(task); setIsMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2",
                      viewMode === 'detailed' ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> Detailed View
                  </button>
                  <button 
                    onClick={() => { setLocalViewMode(null); setIsMenuOpen(false); }}
                    className="w-full px-3 py-2 text-left text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"
                  >
                    <ArrowUpDown className="w-3 h-3" /> Reset to Global
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                  <button 
                    onClick={handleCopyDetails}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Summary
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <h4 className={cn(
        "font-semibold text-slate-900 leading-tight",
        viewMode === 'summary' ? "text-sm mb-1" : "text-base mb-1"
      )}>{task.title}</h4>
      
      {task.description && (
        <p className={cn(
          "text-xs text-slate-500 mb-2",
          viewMode === 'detailed' || viewMode === 'summary' ? "" : "line-clamp-2"
        )}>{task.description}</p>
      )}
      
      {viewMode !== 'summary' && task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map((tag) => (
            <span 
              key={tag} 
              className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded uppercase tracking-wider border border-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {viewMode !== 'summary' && (
        <div className="flex flex-col gap-1.5 mb-3">
          {isBlocked && task.status !== 'Done' && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-md">
              <Link2 className="w-3 h-3 text-amber-600" />
              <span className="text-[10px] font-medium text-amber-700">Blocked by {blockedBy.length} task{blockedBy.length > 1 ? 's' : ''}</span>
            </div>
          )}
          {blocks.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-md">
              <Link2 className="w-3 h-3 text-indigo-600 rotate-180" />
              <span className="text-[10px] font-medium text-indigo-700">Blocks {blocks.length} task{blocks.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {viewMode === 'detailed' && task.subtasks && task.subtasks.length > 0 && (
        <div className="mb-3 space-y-1">
          {task.subtasks.slice(0, 3).map((sub, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[10px] text-slate-500">
              {sub.completed ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Square className="w-3 h-3 text-slate-300" />}
              <span className={cn(sub.completed && "line-through opacity-60")}>{sub.title}</span>
            </div>
          ))}
          {task.subtasks.length > 3 && (
            <div className="text-[9px] text-slate-400 pl-5">+{task.subtasks.length - 3} more subtasks</div>
          )}
        </div>
      )}

      {viewMode === 'detailed' && lastComment && (
        <div className="mb-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">
              {lastComment.author[0]}
            </div>
            <span className="text-[9px] font-bold text-slate-600">{lastComment.author}</span>
            <span className="text-[8px] text-slate-400 ml-auto">{formatDateSafe(lastComment.timestamp)}</span>
          </div>
          <p className="text-[10px] text-slate-500 line-clamp-1 italic">"{lastComment.text}"</p>
        </div>
      )}

      {viewMode !== 'summary' && task.subtasks && task.subtasks.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Progress</span>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
              {Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <div className={cn(
        "flex items-center justify-between border-slate-100",
        viewMode === 'summary' ? "pt-2" : "pt-3 border-t"
      )}>
        <div className="flex flex-wrap gap-2">
          {task.dueDate && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status !== 'Done' 
                ? "text-red-500" 
                : "text-slate-400"
            )}>
              <Calendar className="w-3 h-3" />
              <span>{formatDateSafe(task.dueDate)}</span>
            </div>
          )}
          {viewMode === 'detailed' && task.createdAt && (
            <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{formatDateSafe(task.createdAt)}</span>
            </div>
          )}
          {viewMode !== 'summary' && (
            <>
              {task.comments && task.comments.length > 0 && (
                <div className="flex items-center gap-1 text-slate-400">
                  <MessageSquare className="w-3 h-3" />
                  <span className="text-[10px]">{task.comments.length}</span>
                </div>
              )}
              {task.attachments && task.attachments.length > 0 && (
                <div className="flex items-center gap-1 text-slate-400">
                  <Paperclip className="w-3 h-3" />
                  <span className="text-[10px]">{task.attachments.length}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewMode !== 'summary' && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-medium text-slate-600">{task.assignee}</span>
            </div>
          )}
          <div className={cn(
            "rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700",
            viewMode === 'summary' ? "w-5 h-5 text-[8px]" : "w-6 h-6 text-[10px]"
          )}>
            {task.assignee[0]}
          </div>
        </div>
      </div>
    </div>
  );
};

interface KanbanColumnProps {
  id: string;
  tasks: Task[];
  column: Task['status'];
  onEdit: (task: Task) => void;
  onAdd: () => void;
  allTasks: Task[];
  sortTasks: (tasks: Task[]) => Task[];
  viewMode: CardViewMode;
  onViewModeChange: (mode: CardViewMode) => void;
  onQuickView: (task: Task) => void;
  onDetailedView: (task: Task) => void;
  onSummaryView: (task: Task) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ id, tasks, column, onEdit, onAdd, allTasks, sortTasks, viewMode, onViewModeChange, onQuickView, onDetailedView, onSummaryView }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  const sortedTasks = sortTasks(tasks.filter((t) => t.status === column));

  return (
    <div ref={setNodeRef} className="w-80 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-700">{column}</h3>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            column === 'Todo' ? "bg-yellow-100 text-yellow-700" :
            column === 'In Progress' ? "bg-orange-100 text-orange-700" :
            "bg-green-100 text-green-700"
          )}>
            {sortedTasks.length}
          </span>
        </div>
        <button className="p-1 hover:bg-slate-200 rounded transition-colors">
          <MoreHorizontal className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <SortableContext
        id={id}
        items={sortedTasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar pb-20">
          {sortedTasks.map((task) => (
            <SortableTaskCard 
              key={task.id} 
              task={task} 
              allTasks={allTasks}
              onEdit={onEdit} 
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              onQuickView={onQuickView}
              onDetailedView={onDetailedView}
              onSummaryView={onSummaryView}
            />
          ))}
          
          <button 
            onClick={onAdd}
            className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </SortableContext>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, activeChannel, channels, templates, onSaveTemplate, user, onTaskMove, onTaskReorder, onAddTask, onUpdateTask, onDeleteTask }) => {
  const [priorityFilter, setPriorityFilter] = useState<Task['priority'] | 'All'>('All');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'createdAt' | 'manual'>('manual');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [globalViewMode, setGlobalViewMode] = useState<CardViewMode>('full');
  const [isQuickView, setIsQuickView] = useState(false);
  const [isSummaryMode, setIsSummaryMode] = useState(false);

  // Sync local tasks when tasks prop changes and we're not dragging
  useEffect(() => {
    if (!activeId) {
      // Sort by position initially if manual sort is selected
      const sorted = [...tasks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      setLocalTasks(sorted);
    }
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const priorityMap: Record<Task['priority'], number> = {
    'High': 3,
    'Medium': 2,
    'Low': 1,
  };

  const sortTasks = (tasksToSort: Task[]) => {
    return [...tasksToSort].sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === 'priority') {
        return priorityMap[b.priority] - priorityMap[a.priority];
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'manual') {
        // When manual sort is selected, we rely on the array order in localTasks
        // which is already sorted by position in the useEffect and updated by arrayMove
        return 0;
      }
      return 0;
    });
  };

  const filteredTasks = localTasks.filter(t => {
    const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
    const matchesChannel = activeChannel.id === 'all' || !t.channelId || t.channelId === activeChannel.id;
    return matchesPriority && matchesChannel;
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeTask = localTasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Check if dropping over a column or another task
    const overTask = localTasks.find(t => t.id === overId);
    const isOverAColumn = COLUMNS.includes(overId as Task['status']);

    if (overTask && activeTask.status !== overTask.status) {
      setLocalTasks(prev => {
        const activeIndex = prev.findIndex(t => t.id === activeId);
        const overIndex = prev.findIndex(t => t.id === overId);
        
        const newTasks = [...prev];
        newTasks[activeIndex] = { ...newTasks[activeIndex], status: overTask.status };
        return arrayMove(newTasks, activeIndex, overIndex);
      });
    } else if (isOverAColumn && activeTask.status !== overId) {
      setLocalTasks(prev => {
        const activeIndex = prev.findIndex(t => t.id === activeId);
        const newTasks = [...prev];
        newTasks[activeIndex] = { ...newTasks[activeIndex], status: overId as Task['status'] };
        return arrayMove(newTasks, activeIndex, newTasks.length - 1);
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const overId = over.id as string;
    const activeTask = localTasks.find(t => t.id === activeId);
    const originalTask = tasks.find(t => t.id === activeId);

    if (!activeTask || !originalTask) {
      setActiveId(null);
      return;
    }

    // Sync with server
    if (activeTask.status !== originalTask.status) {
      const columnTasks = localTasks.filter(t => t.status === activeTask.status);
      const newIndex = columnTasks.findIndex(t => t.id === activeId);
      onTaskMove(activeId, activeTask.status, newIndex);
    } else {
      const columnTasks = sortTasks(localTasks.filter(t => t.status === activeTask.status));
      const oldIndex = tasks.filter(t => t.status === activeTask.status).findIndex(t => t.id === activeId);
      const newIndex = columnTasks.findIndex(t => t.id === activeId);
      
      if (oldIndex !== newIndex) {
        onTaskReorder(activeId, newIndex, columnTasks);
      }
    }

    setActiveId(null);
  };

  const activeTask = activeId ? localTasks.find(t => t.id === activeId) : null;

  const handleOpenCreate = () => {
    setSelectedTask(null);
    setIsQuickView(false);
    setIsSummaryMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setSelectedTask(task);
    setIsQuickView(false);
    setIsSummaryMode(false);
    setIsModalOpen(true);
  };

  const handleQuickView = (task: Task) => {
    setSelectedTask(task);
    setIsQuickView(true);
    setIsSummaryMode(false);
    setIsModalOpen(true);
  };

  const handleSummaryView = (task: Task) => {
    setSelectedTask(task);
    setIsQuickView(false);
    setIsSummaryMode(true);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (taskData: Omit<Task, 'id' | 'status'>) => {
    if (selectedTask) {
      onUpdateTask(selectedTask.id, taskData);
    } else {
      onAddTask(taskData);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-x-auto h-full border-l border-slate-200 flex flex-col">
      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleModalSubmit}
        onAddTask={onAddTask}
        onDeleteTask={onDeleteTask}
        initialTask={selectedTask}
        allTasks={localTasks}
        activeChannel={activeChannel}
        channels={channels}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        user={user}
        isReadOnly={isQuickView}
        isSummaryView={isSummaryMode}
      />
      
      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900">Kanban Board</h2>
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 shadow-sm">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  priorityFilter === p 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 shadow-sm">
            {(['summary', 'full', 'detailed'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setGlobalViewMode(m)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                  globalViewMode === m 
                    ? "bg-slate-100 text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {m === 'summary' && <Minimize2 className="w-3 h-3" />}
                {m === 'full' && <Layout className="w-3 h-3" />}
                {m === 'detailed' && <Maximize2 className="w-3 h-3" />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 shadow-sm mr-2">
            <div className="px-2 text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
            </div>
            {(['manual', 'createdAt', 'dueDate', 'priority'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  sortBy === s 
                    ? "bg-slate-100 text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {s === 'manual' ? 'Manual' : s === 'createdAt' ? 'Newest' : s === 'dueDate' ? 'Due Date' : 'Priority'}
              </button>
            ))}
          </div>
          {hasPermission(user.role, 'CREATE_TASK') ? (
            <button 
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-medium border border-slate-200 cursor-not-allowed" title="You don't have permission to create tasks">
              <AlertCircle className="w-3 h-3" />
              No Create Access
            </div>
          )}
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Filter className="w-3.5 h-3.5" />
            More Filters
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 h-full min-w-max flex-1 overflow-hidden">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              id={column}
              column={column}
              tasks={filteredTasks}
              allTasks={localTasks}
              onEdit={handleOpenEdit}
              onAdd={handleOpenCreate}
              sortTasks={sortTasks}
              viewMode={globalViewMode}
              onViewModeChange={setGlobalViewMode}
              onQuickView={handleQuickView}
              onDetailedView={handleQuickView}
              onSummaryView={handleSummaryView}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: '0.5',
              },
            },
          }),
        }}>
          {activeTask ? (
            <div className={cn(
              "bg-white p-4 rounded-xl shadow-2xl border border-indigo-200 w-80 rotate-3 scale-105 cursor-grabbing border-l-4",
              activeTask.status === 'Todo' ? "border-l-yellow-400" :
              activeTask.status === 'In Progress' ? "border-l-orange-500" :
              "border-l-green-500"
            )}>
              <div className="flex justify-between items-start mb-2">
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                  activeTask.status === 'Todo' ? "bg-yellow-100 text-yellow-700" :
                  activeTask.status === 'In Progress' ? "bg-orange-100 text-orange-700" :
                  "bg-green-100 text-green-700"
                )}>
                  {activeTask.status}
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                  activeTask.priority === 'High' ? "bg-red-100 text-red-700" :
                  activeTask.priority === 'Medium' ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700"
                )}>
                  {activeTask.priority === 'High' && <AlertCircle className="w-3 h-3" />}
                  {activeTask.priority === 'Medium' && <AlertTriangle className="w-3 h-3" />}
                  {activeTask.priority === 'Low' && <Info className="w-3 h-3" />}
                  {activeTask.priority}
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                  activeTask.type === 'request' ? "bg-purple-100 text-purple-700" :
                  activeTask.type === 'idea' ? "bg-emerald-100 text-emerald-700" :
                  "bg-slate-100 text-slate-700"
                )}>
                  {activeTask.type === 'request' && <Zap className="w-3 h-3" />}
                  {activeTask.type === 'idea' && <Lightbulb className="w-3 h-3" />}
                  {(!activeTask.type || activeTask.type === 'task') && <CheckSquare className="w-3 h-3" />}
                  {activeTask.type || 'task'}
                </div>
              </div>
              <h4 className="font-semibold text-slate-900 mb-1 leading-tight">{activeTask.title}</h4>
              <p className="text-xs text-slate-500 mb-3 line-clamp-2">{activeTask.description}</p>
              
              {activeTask.subtasks && activeTask.subtasks.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Progress</span>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {Math.round((activeTask.subtasks.filter(s => s.completed).length / activeTask.subtasks.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full"
                      style={{ width: `${(activeTask.subtasks.filter(s => s.completed).length / activeTask.subtasks.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {activeTask.type === 'request' && activeTask.upvotes && activeTask.upvotes.length > 0 && (
                <div className="flex items-center gap-1 text-indigo-500 font-bold mb-3">
                  <Zap className="w-3 h-3" />
                  <span className="text-[10px]">{activeTask.upvotes.length} upvotes</span>
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};


