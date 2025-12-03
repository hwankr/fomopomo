'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  estimated_pomodoros: number;
  duration?: number;
  position: number;
}

const formatDuration = (seconds: number) => {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

interface SortableTaskItemProps {
  task: Task;
  toggleTaskStatus: (task: Task) => void;
  deleteTask: (id: string) => void;
}

function SortableTaskItem({ task, toggleTaskStatus, deleteTask }: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all",
        isDragging && "shadow-lg bg-white dark:bg-gray-800 border-rose-200 dark:border-rose-900"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
        <GripVertical className="w-5 h-5" />
      </div>

      <button
        onClick={() => toggleTaskStatus(task)}
        className={cn(
          "flex-shrink-0 transition-colors",
          task.status === 'done' ? "text-rose-500" : "text-gray-300 hover:text-gray-400"
        )}
      >
        {task.status === 'done' ? (
          <CheckCircle2 className="w-6 h-6" />
        ) : (
          <Circle className="w-6 h-6" />
        )}
      </button>

      <span className={cn(
        "flex-1 font-medium transition-all",
        task.status === 'done' ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"
      )}>
        {task.title}
      </span>

      {task.duration ? (
        <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded-md whitespace-nowrap">
          {formatDuration(task.duration)}
        </span>
      ) : null}

      <button
        onClick={() => deleteTask(task.id)}
        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 transition-all"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

interface TaskListProps {
  selectedDate: Date;
  userId: string;
}

export default function TaskList({ selectedDate, userId }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchTasks = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('due_date', dateStr)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }); // Fallback if position is null/same

    if (error) {
      console.error('Error fetching tasks:', error);
    } else {
      const taskIds = (data || []).map((t: any) => t.id);

      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('task_id, duration')
        .in('task_id', taskIds);

      const tasksWithDuration = (data || []).map((task: any) => {
        const taskSessions = sessions?.filter((s: any) => s.task_id === task.id) || [];
        const totalDuration = taskSessions.reduce((acc: number, curr: any) => acc + curr.duration, 0);
        return { ...task, duration: totalDuration };
      });
      setTasks(tasksWithDuration);
    }
    setLoading(false);
  }, [selectedDate, userId]);

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel('task-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events to catch updates too
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // We might want to be careful here not to overwrite optimistic updates while dragging
          // For now, simple re-fetch is okay but might be jittery if multiple users edit (unlikely here)
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks, userId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update positions in DB
        // We update all items to ensure consistency. 
        // Optimization: only update affected range if list is huge, but for daily tasks it's fine.
        const updates = newItems.map((task, index) => ({
          id: task.id,
          position: index,
          updated_at: new Date().toISOString(),
        }));

        // Fire and forget update (or handle error quietly)
        updates.forEach(async (update) => {
          await supabase
            .from('tasks')
            .update({ position: update.position })
            .eq('id', update.id);
        });

        return newItems;
      });
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (!userId) {
      alert('Please log in to add tasks.');
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Calculate new position (at the end)
    const maxPosition = tasks.length > 0 ? Math.max(...tasks.map(t => t.position || 0)) : -1;
    const newPosition = maxPosition + 1;

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: newTaskTitle,
        due_date: dateStr,
        status: 'todo',
        position: newPosition,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding task:', error);
    } else if (data) {
      setTasks([...tasks, { ...data, duration: 0 }]); // Add duration: 0 for consistency
      setNewTaskTitle('');
      setIsAdding(false);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';

    // Optimistic update
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id);

    if (error) {
      console.error('Error updating task:', error);
      // Revert if error
      fetchTasks();
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    // Optimistic update
    setTasks(tasks.filter(t => t.id !== id));

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting task:', error);
      fetchTasks();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
        {loading && tasks.length === 0 ? (
          <div className="text-center text-gray-400 py-10">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">📝</span>
            </div>
            <p>No tasks for this day.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="mt-4 text-rose-500 hover:text-rose-600 font-medium text-sm"
            >
              + Add your first task
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  toggleTaskStatus={toggleTaskStatus}
                  deleteTask={deleteTask}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
        {isAdding ? (
          <form onSubmit={addTask} className="flex gap-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:text-white"
              autoFocus
            />
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="px-6 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 dark:hover:border-gray-600 transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Plus className="w-5 h-5" />
            Add Task
          </button>
        )}
      </div>
    </div>
  );
}
