"use client";
/**
 * TasksContext — task filter state shared across components
 *
 * Manages:
 * - Task filter state (search, assignee, status)
 * - Shared across TasksPage and any components that need task filtering
 *
 * Usage:
 *   // Wrap the tasks page or layout:
 *   <TasksProvider>{children}</TasksProvider>
 *
 *   // In any component:
 *   const { search, setSearch, assigneeFilter, setAssigneeFilter } = useTasks();
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskAssignee = "all" | "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
export type TaskStatus   = "all" | "suggested" | "backlog" | "in_progress" | "blocked" | "done";

export interface TasksFilterState {
  /** Text search query */
  search: string;
  /** Assignee filter */
  assigneeFilter: TaskAssignee;
  /** Status filter */
  statusFilter: TaskStatus;
  /** Whether to show only true blockers */
  trueBlockersOnly: boolean;
}

export interface TasksFilterActions {
  setSearch: (search: string) => void;
  setAssigneeFilter: (assignee: TaskAssignee) => void;
  setStatusFilter: (status: TaskStatus) => void;
  setTrueBlockersOnly: (value: boolean) => void;
  resetFilters: () => void;
}

export type TasksContextValue = TasksFilterState & TasksFilterActions;

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_FILTER_STATE: TasksFilterState = {
  search: "",
  assigneeFilter: "all",
  statusFilter: "all",
  trueBlockersOnly: false,
};

// ── Context ────────────────────────────────────────────────────────────────

const TasksContext = createContext<TasksContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export interface TasksProviderProps {
  children: React.ReactNode;
  /** Initial filter state (optional) */
  initialState?: Partial<TasksFilterState>;
}

export function TasksProvider({ children, initialState }: TasksProviderProps) {
  const [search, setSearchState]                   = useState(initialState?.search ?? DEFAULT_FILTER_STATE.search);
  const [assigneeFilter, setAssigneeFilterState]   = useState<TaskAssignee>(initialState?.assigneeFilter ?? DEFAULT_FILTER_STATE.assigneeFilter);
  const [statusFilter, setStatusFilterState]       = useState<TaskStatus>(initialState?.statusFilter ?? DEFAULT_FILTER_STATE.statusFilter);
  const [trueBlockersOnly, setTrueBlockersOnlyState] = useState(initialState?.trueBlockersOnly ?? DEFAULT_FILTER_STATE.trueBlockersOnly);

  // ── Actions ─────────────────────────────────────────────────────────────

  const setSearch = useCallback((s: string) => {
    setSearchState(s);
  }, []);

  const setAssigneeFilter = useCallback((a: TaskAssignee) => {
    setAssigneeFilterState(a);
  }, []);

  const setStatusFilter = useCallback((s: TaskStatus) => {
    setStatusFilterState(s);
  }, []);

  const setTrueBlockersOnly = useCallback((v: boolean) => {
    setTrueBlockersOnlyState(v);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchState(DEFAULT_FILTER_STATE.search);
    setAssigneeFilterState(DEFAULT_FILTER_STATE.assigneeFilter);
    setStatusFilterState(DEFAULT_FILTER_STATE.statusFilter);
    setTrueBlockersOnlyState(DEFAULT_FILTER_STATE.trueBlockersOnly);
  }, []);

  // ── Context value ────────────────────────────────────────────────────────

  const value: TasksContextValue = {
    // State
    search,
    assigneeFilter,
    statusFilter,
    trueBlockersOnly,
    // Actions
    setSearch,
    setAssigneeFilter,
    setStatusFilter,
    setTrueBlockersOnly,
    resetFilters,
  };

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return ctx;
}

export default TasksContext;
