"use client";
/**
 * MissionControlContext — global app state
 *
 * Manages:
 * - Sidebar open/closed state (replaces localStorage-only approach)
 * - Active section tracking
 * - Global app state (theme, preferences)
 *
 * Usage:
 *   // In layout.tsx:
 *   <MissionControlProvider>{children}</MissionControlProvider>
 *
 *   // In any component:
 *   const { sidebarCollapsed, toggleSidebar } = useMissionControl();
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MissionControlState {
  /** Whether the desktop sidebar is collapsed to icon rail */
  sidebarCollapsed: boolean;
  /** Whether the mobile drawer is open */
  mobileSidebarOpen: boolean;
  /** Whether we're on a mobile viewport */
  isMobile: boolean;
  /** Whether the component has mounted (for SSR safety) */
  mounted: boolean;
  /** Active navigation section (pathname) */
  activeSection: string;
}

export interface MissionControlActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
  setActiveSection: (section: string) => void;
}

export type MissionControlContextValue = MissionControlState & MissionControlActions;

// ── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "mc_sidebar_collapsed";
const MOBILE_BP   = 768;

// ── Context ────────────────────────────────────────────────────────────────

const MissionControlContext = createContext<MissionControlContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export interface MissionControlProviderProps {
  children: React.ReactNode;
}

export function MissionControlProvider({ children }: MissionControlProviderProps) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen]    = useState(false);
  const [isMobile, setIsMobile]                      = useState(false);
  const [mounted, setMounted]                        = useState(false);
  const [activeSection, setActiveSection]            = useState("/");

  // ── Initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);

    // Restore persisted sidebar state
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setSidebarCollapsedState(true);

    // Set up mobile breakpoint listener
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Persist desktop collapsed state
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, mounted]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((c) => !c);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
  }, []);

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((o) => !o);
  }, []);

  const handleSetActiveSection = useCallback((section: string) => {
    setActiveSection(section);
  }, []);

  // ── Context value ────────────────────────────────────────────────────────

  const value: MissionControlContextValue = {
    // State
    sidebarCollapsed,
    mobileSidebarOpen,
    isMobile,
    mounted,
    activeSection,
    // Actions
    toggleSidebar,
    setSidebarCollapsed,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
    setActiveSection: handleSetActiveSection,
  };

  return (
    <MissionControlContext.Provider value={value}>
      {children}
    </MissionControlContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useMissionControl(): MissionControlContextValue {
  const ctx = useContext(MissionControlContext);
  if (!ctx) {
    throw new Error(
      "useMissionControl must be used within a MissionControlProvider"
    );
  }
  return ctx;
}

export default MissionControlContext;
