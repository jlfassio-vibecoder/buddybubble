import React, { useState } from 'react';
import { Plus, MoreHorizontal, Clock, User, Filter, Edit2, Calendar, MessageSquare, CheckSquare, GripVertical, AlertCircle, AlertTriangle, Info, Link2, ArrowUpDown, Paperclip } from 'lucide-react';
import { Task, Channel, UserProfile, TaskTemplate } from '../types';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { TaskModal } from './TaskModal';
import { format, isPast, isToday } from 'date-fns';
import { hasPermission } from '../lib/permissions';
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
  onTaskMove: (taskId: string, newStatus: Task['status']) => void;
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
}

const SortableTaskCard: React.FC<SortableTaskCardProps> = ({ task, allTasks, onEdit }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group relative border-l-4",
        task.priority === 'High' ? "border-l-red-500" :
        task.priority === 'Medium' ? "border-l-amber-500" :
        "border-l-blue-500",
        isDragging && "z-50 ring-2 ring-indigo-500 ring-offset-2",
        isBlocked && task.status !== 'Done' && "opacity-75"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div 
            {...attributes} 
            {...listeners}
            className="p-1 -ml-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5" />
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
          {isBlocked && task.status !== 'Done' && (
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              <Link2 className="w-3 h-3" />
              Blocked
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEdit(task)}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <h4 className="font-semibold text-slate-900 mb-1 leading-tight">{task.title}</h4>
      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{task.description}</p>
      
      {task.tags && task.tags.length > 0 && (
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
        {relatedTasks.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded-md">
            <Link2 className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-600">Related to {relatedTasks.length} task{relatedTasks.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {task.subtasks && task.subtasks.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-400">Subtasks</span>
            <span className="text-[10px] font-bold text-indigo-600">
              {Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100)}%
            </span>
          </div>
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex flex-col gap-1">
          {task.dueDate && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status !== 'Done' 
                ? "text-red-500" 
                : "text-slate-400"
            )}>
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(task.dueDate), 'MMM d')}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3" />
            <span className="text-[10px]">2d left</span>
          </div>
          {task.comments && task.comments.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <MessageSquare className="w-3 h-3" />
              <span className="text-[10px]">{task.comments.length}</span>
            </div>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <CheckSquare className="w-3 h-3" />
              <span className="text-[10px]">
                {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
              </span>
            </div>
          )}
          {task.dependencies && task.dependencies.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <Link2 className="w-3 h-3" />
              <span className="text-[10px]">{task.dependencies.length}</span>
            </div>
          )}
          {task.relatedTaskIds && task.relatedTaskIds.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <Link2 className="w-3 h-3 opacity-60" />
              <span className="text-[10px]">{task.relatedTaskIds.length}</span>
            </div>
          )}
          {task.attachments && task.attachments.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <Paperclip className="w-3 h-3" />
              <span className="text-[10px]">{task.attachments.length}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium text-slate-600">{task.assignee}</span>
            {task.assigner && (
              <span className="text-[8px] text-slate-400 leading-none">by {task.assigner}</span>
            )}
          </div>
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
            {task.assignee[0]}
          </div>
        </div>
      </div>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, activeChannel, channels, templates, onSaveTemplate, user, onTaskMove, onAddTask, onUpdateTask, onDeleteTask }) => {
  const [priorityFilter, setPriorityFilter] = useState<Task['priority'] | 'All'>('All');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'createdAt'>('createdAt');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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
      return 0;
    });
  };

  const filteredTasks = tasks.filter(t => {
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

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Check if dropping over a column or another task
    const overTask = tasks.find(t => t.id === overId);
    const isOverAColumn = COLUMNS.includes(overId as Task['status']);

    if (overTask && activeTask.status !== overTask.status) {
      onTaskMove(activeId, overTask.status);
    } else if (isOverAColumn && activeTask.status !== overId) {
      onTaskMove(activeId, overId as Task['status']);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  const handleOpenCreate = () => {
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setSelectedTask(task);
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
        allTasks={tasks}
        activeChannel={activeChannel}
        channels={channels}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        user={user}
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
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 shadow-sm mr-2">
            <div className="px-2 text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
            </div>
            {(['createdAt', 'dueDate', 'priority'] as const).map((s) => (
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
                {s === 'createdAt' ? 'Newest' : s === 'dueDate' ? 'Due Date' : 'Priority'}
              </button>
            ))}
          </div>
          {hasPermission(user.role, 'CREATE_TASK') ? (
            <button 
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
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
            <div key={column} className="w-80 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-700">{column}</h3>
                  <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-medium">
                    {filteredTasks.filter(t => t.status === column).length}
                  </span>
                </div>
                <button className="p-1 hover:bg-slate-200 rounded transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <SortableContext
                id={column}
                items={sortTasks(filteredTasks.filter(t => t.status === column)).map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar pb-20">
                  {sortTasks(filteredTasks.filter((t) => t.status === column))
                    .map((task) => (
                      <SortableTaskCard 
                        key={task.id} 
                        task={task} 
                        allTasks={tasks}
                        onEdit={handleOpenEdit} 
                      />
                    ))}
                  
                  <button 
                    onClick={handleOpenCreate}
                    className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Task
                  </button>
                </div>
              </SortableContext>
            </div>
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
              activeTask.priority === 'High' ? "border-l-red-500" :
              activeTask.priority === 'Medium' ? "border-l-amber-500" :
              "border-l-blue-500"
            )}>
              <div className="flex justify-between items-start mb-2">
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
              </div>
              <h4 className="font-semibold text-slate-900 mb-1 leading-tight">{activeTask.title}</h4>
              <p className="text-xs text-slate-500 mb-3 line-clamp-2">{activeTask.description}</p>
              
              {activeTask.subtasks && activeTask.subtasks.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-slate-400">Subtasks</span>
                    <span className="text-[10px] font-bold text-indigo-600">
                      {Math.round((activeTask.subtasks.filter(s => s.completed).length / activeTask.subtasks.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(activeTask.subtasks.filter(s => s.completed).length / activeTask.subtasks.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};


