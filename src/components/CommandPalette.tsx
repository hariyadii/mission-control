"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";

// Use relative import for Convex API
const { api } = require("../../convex/_generated/api");

// Import Tooltip component
import { Tooltip } from "./ui";

type Command = {
  id: string;
  label: string;
  category: "Navigation" | "Quick Actions" | "Tasks" | "Help";
  shortcut?: string;
  action: () => void;
};

type Task = {
  _id: string;
  _creationTime: number;
  title: string;
  assigned_to: string;
  status: string;
};

// Full shortcut mapping for hover tooltips
const SHORTCUT_FULL_MAP: Record<string, string> = {
  "G O": "Ctrl+G then O",
  "G T": "Ctrl+G then T",
  "G C": "Ctrl+G then C",
  "G M": "Ctrl+G then M",
  "G Y": "Ctrl+G then Y",
  "G A": "Ctrl+G then A",
  "G N": "Ctrl+G then N",
  "G U": "Ctrl+G then U",
  "N": "Ctrl+N",
  "R": "Ctrl+R",
  "?": "Shift+/",
};

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch tasks from Convex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = useQuery(api.tasks.list) as any[];
  
  // Filter tasks based on query
  const filteredTasks = useMemo(() => {
    if (!tasks || !query.trim()) return [];
    const q = query.toLowerCase();
    return (tasks as Task[])
      .filter(task => 
        task.title.toLowerCase().includes(q) ||
        task.assigned_to.toLowerCase().includes(q)
      )
      .slice(0, 5); // Limit to 5 tasks
  }, [tasks, query]);

  // Define commands inside component after router is available
  const allCommands: Command[] = useMemo(() => {
    const nav: Command[] = [
      { id: "nav-overview", label: "Go to Overview", category: "Navigation", action: () => router.push("/") },
      { id: "nav-tasks", label: "Go to Tasks", category: "Navigation", shortcut: "G T", action: () => router.push("/tasks") },
      { id: "nav-calendar", label: "Go to Calendar", category: "Navigation", shortcut: "G C", action: () => router.push("/calendar") },
      { id: "nav-team", label: "Go to Team", category: "Navigation", action: () => router.push("/team") },
      { id: "nav-memory", label: "Go to Memory", category: "Navigation", action: () => router.push("/memory") },
      { id: "nav-office", label: "Go to Office", category: "Navigation", action: () => router.push("/office") },
      { id: "nav-capital", label: "Go to Capital", category: "Navigation", action: () => router.push("/capital") },
      { id: "nav-control", label: "Go to Control", category: "Navigation", action: () => router.push("/control") },
      { id: "nav-audit", label: "Go to Audit", category: "Navigation", action: () => router.push("/audit") },
    ];
    
    const actions: Command[] = [
      { id: "action-new-task", label: "Create New Task", category: "Quick Actions", shortcut: "N", action: () => router.push("/tasks?new=true") },
      { id: "action-refresh", label: "Refresh Data", category: "Quick Actions", shortcut: "R", action: () => window.location.reload() },
      { id: "action-help", label: "Show Keyboard Shortcuts", category: "Help", shortcut: "?", action: () => {} },
    ];
    
    // Build task commands from filtered tasks
    const taskCommands: Command[] = filteredTasks.map((task) => ({
      id: `task-${task._id}`,
      label: `${task.title} (${task.assigned_to})`,
      category: "Tasks" as const,
      action: () => router.push(`/tasks?q=${encodeURIComponent(task.title)}`),
    }));
    
    return [...nav, ...actions, ...taskCommands];
  }, [router, filteredTasks]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // When no query, show only navigation and actions (not tasks)
      return allCommands.filter(cmd => cmd.category !== "Tasks");
    }
    
    const q = query.toLowerCase();
    return allCommands.filter(cmd => 
      cmd.label.toLowerCase().includes(q) || 
      cmd.category.toLowerCase().includes(q)
    );
  }, [allCommands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Flatten for navigation
  const flatCommands = useMemo(() => filteredCommands, [filteredCommands]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % flatCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + flatCommands.length) % flatCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatCommands[selectedIndex];
      if (cmd) {
        cmd.action();
        setIsOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setQuery("");
    }
  }, [flatCommands, selectedIndex]);

  // Global keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        // Allow Cmd+K to work even in input (close/open)
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          setIsOpen(prev => !prev);
          return;
        }
        return;
      }

      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  if (!isOpen) return null;

  let currentIndex = 0;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => { setIsOpen(false); setQuery(""); }}
    >
      <div 
        className="w-full max-w-xl rounded-xl border border-stone-300/50 bg-stone-50/95 shadow-2xl backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="border-b border-stone-300/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-stone-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search commands, pages, or tasks..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-stone-800 placeholder-stone-500 outline-none text-base"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-xs font-mono text-stone-500 border border-stone-300">
              <span className="text-[10px]">esc</span>
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {flatCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-stone-500">
              No commands found for &quot;{query}&quot;
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, commands]) => (
              <div key={category} className="mb-2">
                <p className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-stone-500">
                  {category}
                </p>
                {commands.map((cmd) => {
                  const idx = currentIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => { cmd.action(); setIsOpen(false); setQuery(""); }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors ${
                        isSelected 
                          ? "bg-indigo-600/20 text-indigo-100" 
                          : "text-stone-600 hover:bg-stone-100/50"
                      }`}
                    >
                      <span className="text-sm">{cmd.label}</span>
                      {cmd.shortcut && (
                        <Tooltip content={SHORTCUT_FULL_MAP[cmd.shortcut] || cmd.shortcut}>
                          <kbd className="rounded bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-500 border border-stone-300 cursor-help">
                            {cmd.shortcut}
                          </kbd>
                        </Tooltip>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-300/50 px-4 py-2 flex items-center justify-between text-[11px] text-stone-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-mono">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-mono">↵</kbd>
              <span>Select</span>
            </span>
          </div>
          <span>Press <kbd className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd> to toggle</span>
        </div>
      </div>
    </div>
  );
}
