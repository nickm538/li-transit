/*
 * MobileSidebarToggle — Floating button to show/hide sidebar on mobile
 * On mobile the sidebar is now a bottom sheet, so this toggle is less critical
 * but still useful as a quick-access button
 */
import { useState, createContext, useContext, type ReactNode } from 'react';
import { List, X } from 'lucide-react';

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen(p => !p),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export function MobileSidebarToggle() {
  const { isOpen, toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="md:hidden fixed top-[4.5rem] left-3 z-40 w-10 h-10 rounded-xl glass-panel flex items-center justify-center text-foreground transition-colors"
      style={{ borderColor: 'rgba(217,119,87,0.2)' }}
      aria-label={isOpen ? 'Hide routes' : 'Show routes'}
    >
      {isOpen ? <X className="w-5 h-5" /> : <List className="w-5 h-5" />}
    </button>
  );
}
