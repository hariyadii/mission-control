"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

const SHORTCUTS = [
  { key: "?", label: "Show keyboard shortcuts", category: "Help" },
  { key: "j", label: "Navigate to next item", category: "Navigation" },
  { key: "k", label: "Navigate to previous item", category: "Navigation" },
  { key: "Enter", label: "Go to selected item", category: "Navigation" },
  { key: "c", label: "Go to Tasks (claim)", category: "Quick Nav" },
  { key: "/", label: "Go to Overview", category: "Quick Nav" },
  { key: "t", label: "Go to Team", category: "Quick Nav" },
  { key: "m", label: "Go to Memory", category: "Quick Nav" },
  { key: "Escape", label: "Close this dialog", category: "Help" },
];

const NAV_ORDER = ["/", "/tasks", "/calendar", "/memory", "/team", "/office", "/capital", "/control", "/audit"];

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const currentIndex = NAV_ORDER.indexOf(pathname);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
    ) {
      return;
    }

    // ? - Show help
    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }

    // Escape - Close modal
    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
      return;
    }

    // Don't process other shortcuts if modal is open (except Escape handled above)
    if (isOpen) return;

    // j - Next item
    if (e.key === "j") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % NAV_ORDER.length;
      router.push(NAV_ORDER[nextIndex]);
      return;
    }

    // k - Previous item
    if (e.key === "k") {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + NAV_ORDER.length) % NAV_ORDER.length;
      router.push(NAV_ORDER[prevIndex]);
      return;
    }

    // Enter - Go to selected
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(NAV_ORDER[selectedIndex]);
      return;
    }

    // Quick navigation keys
    switch (e.key.toLowerCase()) {
      case "c":
        e.preventDefault();
        router.push("/tasks");
        break;
      case "/":
        e.preventDefault();
        router.push("/");
        break;
      case "t":
        e.preventDefault();
        router.push("/team");
        break;
      case "m":
        e.preventDefault();
        router.push("/memory");
        break;
    }
  }, [isOpen, currentIndex, selectedIndex, router]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Update selected index based on current pathname when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(currentIndex);
    }
  }, [isOpen, currentIndex]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    >
      <div 
        className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Keyboard Shortcuts</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{category}</p>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-300">{shortcut.label}</span>
                    <kbd className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-300 border border-slate-700">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Press <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">?</kbd> anytime to show this help
        </p>
      </div>
    </div>
  );
}
