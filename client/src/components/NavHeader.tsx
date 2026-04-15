/*
 * NavHeader — Claude-inspired warm dark navigation
 * Typography: Space Grotesk headings, Source Serif 4 body
 * Colors: Warm terracotta accent, muted warm grays
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
    { path: '/explore', label: 'Explore', icon: MapPin },
    { path: '/plan', label: 'Plan Trip', icon: Navigation },
    { path: '/nearby', label: 'Nearby', icon: Bus },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel">
      <div className="flex items-center justify-between h-14 px-3 md:px-6">
        {/* Logo / Brand — Claude-style clean typography */}
        <Link href="/" className="flex items-center gap-2.5 no-underline shrink-0">
          <div className="relative">
            <Bus className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#d97757' }} />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#788c5d] pulse-marker" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm md:text-base font-semibold tracking-tight text-foreground leading-none"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", letterSpacing: '-0.02em' }}>
              LI Transit
            </span>
            <span className="text-[9px] md:text-[10px] text-muted-foreground tracking-wide uppercase leading-none mt-0.5"
              style={{ fontFamily: "'Source Serif 4', Georgia, serif", letterSpacing: '0.08em' }}>
              Navigator
            </span>
          </div>
        </Link>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-0.5">
          {tabs.map(tab => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <Link key={tab.path} href={tab.path}>
                <motion.div
                  className={`
                    relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm transition-colors
                    ${isActive
                      ? 'text-foreground bg-white/8'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/4'
                    }
                  `}
                  style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: isActive ? 500 : 400 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                      style={{ background: '#d97757' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Status indicators — desktop only */}
        <div className="hidden md:flex items-center gap-4 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#6a9bcc' }}>{suffolkCount}</span>
            <span className="text-muted-foreground">Suffolk</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#d97757' }}>{nassauCount}</span>
            <span className="text-muted-foreground">Nassau</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <Wifi className={`w-3 h-3 ${loading ? 'animate-pulse' : ''}`}
              style={{ color: loading ? '#d97757' : '#788c5d' }} />
            <span className="text-muted-foreground">
              {loading ? 'SYNC' : 'LIVE'}
            </span>
          </div>
        </div>

        {/* Mobile status — compact */}
        <div className="flex md:hidden items-center gap-1.5">
          <Wifi className={`w-3 h-3 ${loading ? 'animate-pulse' : ''}`}
            style={{ color: loading ? '#d97757' : '#788c5d' }} />
        </div>
      </div>
    </header>
  );
}
