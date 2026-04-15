/*
 * NavHeader — Transit Control Room navigation
 * Design: Dark industrial, glass panel, JetBrains Mono for data, DM Sans for labels
 * Colors: Electric blue (#00D4FF) Suffolk, Amber (#FFB020) Nassau
 * Mobile: Compact header with visible tab labels
 */
import { Link, useLocation } from 'wouter';
import { Bus, MapPin, Navigation, Wifi } from 'lucide-react';
import { useTransit } from '@/contexts/TransitContext';
import { motion } from 'framer-motion';

export default function NavHeader() {
  const [location] = useLocation();
  const { routes, loading } = useTransit();

  const suffolkCount = routes.filter(r => r.county === 'Suffolk').length;
  const nassauCount = routes.filter(r => r.county === 'Nassau').length;

  const tabs = [
    { path: '/', label: 'Explore', icon: MapPin },
    { path: '/plan', label: 'Plan Trip', icon: Navigation },
    { path: '/nearby', label: 'Nearby', icon: Bus },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel">
      <div className="flex items-center justify-between h-14 px-3 md:px-6">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-2 no-underline shrink-0">
          <div className="relative">
            <Bus className="w-5 h-5 md:w-6 md:h-6 text-[#00D4FF]" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#00FF88] pulse-marker" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-xs md:text-sm font-bold tracking-wider text-foreground leading-none">
              LI TRANSIT
            </span>
            <span className="text-[8px] md:text-[10px] text-muted-foreground tracking-widest uppercase leading-none mt-0.5">
              Navigator
            </span>
          </div>
        </Link>

        {/* Tab Navigation — always show labels */}
        <nav className="flex items-center gap-1">
          {tabs.map(tab => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <Link key={tab.path} href={tab.path}>
                <motion.div
                  className={`
                    relative flex items-center gap-1.5 px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors
                    ${isActive
                      ? 'text-[#00D4FF] bg-[#00D4FF]/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }
                  `}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#00D4FF] rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Status indicators — desktop only */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-[#00D4FF]">{suffolkCount}</span>
            <span className="text-muted-foreground">Suffolk</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#FFB020]">{nassauCount}</span>
            <span className="text-muted-foreground">Nassau</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <Wifi className={`w-3 h-3 ${loading ? 'text-[#FFB020] animate-pulse' : 'text-[#00FF88]'}`} />
            <span className="text-muted-foreground">
              {loading ? 'SYNC' : 'LIVE'}
            </span>
          </div>
        </div>

        {/* Mobile status — compact */}
        <div className="flex md:hidden items-center gap-1.5">
          <Wifi className={`w-3 h-3 ${loading ? 'text-[#FFB020] animate-pulse' : 'text-[#00FF88]'}`} />
        </div>
      </div>
    </header>
  );
}
