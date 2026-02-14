import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/utils";
import type { Task, TaskStatus, TaskPriority, TaskCategory } from "@agenthub/shared";

interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  assignedAgentId?: string;
}

interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  agentId?: string;
}

export function useTasks(projectId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!projectId) return;
    try {
      const { tasks } = await api<{ tasks: Task[] }>(`/tasks?projectId=${projectId}`);
      setTasks(tasks);
    } catch {
      // silently fail — UI shows empty state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    const { task } = await api<{ task: Task }>("/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setTasks((prev) => [task, ...prev]);
    return task;
  }, []);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const { task } = await api<{ task: Task }>(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
    return task;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await api(`/tasks/${taskId}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const filterTasks = useCallback(
    (filters: TaskFilters): Task[] => {
      return tasks.filter((t) => {
        if (filters.status && t.status !== filters.status) return false;
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.agentId && t.assignedAgentId !== filters.agentId) return false;
        return true;
      });
    },
    [tasks],
  );

  const getTasksByStatus = useCallback(
    (status: TaskStatus): Task[] => {
      return tasks.filter((t) => t.status === status);
    },
    [tasks],
  );

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    filterTasks,
    getTasksByStatus,
    refetch: fetchTasks,
  };
}
