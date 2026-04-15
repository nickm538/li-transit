/*
 * MobileSidebarToggle — Floating button to show/hide sidebar on mobile
 */
import { useState, createContext, useContext, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
      className="md:hidden fixed top-16 left-3 z-40 w-10 h-10 rounded-lg glass-panel flex items-center justify-center text-foreground hover:text-[#00D4FF] transition-colors"
    >
      {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  );
}
