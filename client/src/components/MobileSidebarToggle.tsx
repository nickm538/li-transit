/*
 * SidebarToggle — Collapse/expand the route sidebar on BOTH mobile and desktop
 * Provides context for sidebar open/close state across components
 */
import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarContextType {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: true,
  isMobile: false,
  toggle: () => {},
  close: () => {},
  open: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-close on mobile, auto-open on desktop
      if (mobile && isOpen) setIsOpen(false);
      if (!mobile && !isOpen) setIsOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        isMobile,
        toggle: () => setIsOpen(p => !p),
        close: () => setIsOpen(false),
        open: () => setIsOpen(true),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarToggleButton() {
  const { isOpen, isMobile, toggle } = useSidebar();

  // Position: when sidebar is open on desktop, place button at right edge of sidebar
  // On mobile or when closed, place at top-left
  const leftPos = isOpen && !isMobile ? '21rem' : '0.75rem';

  return (
    <button
      onClick={toggle}
      className="fixed z-40 w-9 h-9 rounded-lg glass-panel flex items-center justify-center text-foreground hover:text-[#d97757]"
      style={{
        top: '4.25rem',
        left: leftPos,
        borderColor: 'rgba(217,119,87,0.15)',
        transition: 'left 0.3s ease, color 0.15s ease',
      }}
      aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      {isOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
    </button>
  );
}
