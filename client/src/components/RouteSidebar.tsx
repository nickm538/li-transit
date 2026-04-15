/*
 * RouteSidebar — Floating glass panel listing all bus routes
 * Design: Translucent panel, route color indicators
 * Mobile: Bottom sheet with drag handle, Desktop: Left side panel
 */
import { useState, useMemo } from 'react';
import { useTransit } from '@/contexts/TransitContext';
import { useSidebar } from '@/components/MobileSidebarToggle';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronRight, X, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RouteSidebar() {
  const { routes, routeColors, selectedRoute, setSelectedRoute } = useTransit();
  const [search, setSearch] = useState('');
  const [countyFilter, setCountyFilter] = useState<'all' | 'Suffolk' | 'Nassau'>('all');

  const filtered = useMemo(() => {
    return routes.filter(r => {
      const matchSearch = search === '' ||
        r.short_name.toLowerCase().includes(search.toLowerCase()) ||
        r.long_name.toLowerCase().includes(search.toLowerCase());
      const matchCounty = countyFilter === 'all' || r.county === countyFilter;
      return matchSearch && matchCounty;
    });
  }, [routes, search, countyFilter]);

  const suffolkRoutes = filtered.filter(r => r.county === 'Suffolk');
  const nassauRoutes = filtered.filter(r => r.county === 'Nassau');

  const { isOpen, toggle } = useSidebar();

  return (
    <div className={`
      fixed md:absolute
      bottom-0 left-0 right-0 md:right-auto
      md:top-16 md:left-3 md:bottom-3 md:w-80
      max-h-[65dvh] md:max-h-none
      z-30 glass-panel rounded-t-2xl md:rounded-lg overflow-hidden flex flex-col
      transition-transform duration-300
      ${isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-[calc(100%-3rem)] md:translate-y-0 md:-translate-x-[calc(100%+1rem)] md:translate-x-0'}
    `}>
      {/* Mobile drag handle */}
      <button
        onClick={toggle}
        className="md:hidden flex items-center justify-center py-1.5 border-b border-border/30"
      >
        <GripHorizontal className="w-6 h-2 text-muted-foreground" />
      </button>

      {/* Header */}
      <div className="p-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-mono text-xs font-bold tracking-wider text-foreground uppercase">
            Bus Routes
          </h2>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {routes.length}
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search routes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-background/50 border-border/50 font-mono"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* County filter */}
        <div className="flex gap-1.5 mt-2">
          {(['all', 'Suffolk', 'Nassau'] as const).map(f => (
            <button
              key={f}
              onClick={() => setCountyFilter(f)}
              className={`
                px-2.5 py-1 rounded text-[10px] font-mono font-medium uppercase tracking-wider transition-all
                ${countyFilter === f
                  ? (f === 'Suffolk' ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                    : f === 'Nassau' ? 'bg-[#FFB020]/20 text-[#FFB020] border border-[#FFB020]/30'
                    : 'bg-primary/15 text-primary border border-primary/30')
                  : 'bg-secondary text-muted-foreground border border-transparent hover:border-border/50'
                }
              `}
            >
              {f === 'all' ? `All (${routes.length})` : f === 'Suffolk' ? `Suffolk (${routes.filter(r => r.county === 'Suffolk').length})` : `Nassau (${routes.filter(r => r.county === 'Nassau').length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Route list — native scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-2 pb-6">
          {/* Suffolk section */}
          {suffolkRoutes.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#00D4FF]" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-[#00D4FF] uppercase">
                  Suffolk County Transit
                </span>
              </div>
              <AnimatePresence>
                {suffolkRoutes.map((route, i) => (
                  <RouteItem
                    key={route.id}
                    route={route}
                    color={routeColors.get(route.id) || '#00D4FF'}
                    isSelected={selectedRoute?.id === route.id}
                    onClick={() => setSelectedRoute(selectedRoute?.id === route.id ? null : route)}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Nassau section */}
          {nassauRoutes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#FFB020]" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-[#FFB020] uppercase">
                  NICE Bus (Nassau)
                </span>
              </div>
              <AnimatePresence>
                {nassauRoutes.map((route, i) => (
                  <RouteItem
                    key={route.id}
                    route={route}
                    color={routeColors.get(route.id) || '#FFB020'}
                    isSelected={selectedRoute?.id === route.id}
                    onClick={() => setSelectedRoute(selectedRoute?.id === route.id ? null : route)}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs font-mono">
              No routes match your search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RouteItem({
  route,
  color,
  isSelected,
  onClick,
  index,
}: {
  route: any;
  color: string;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ delay: index * 0.02 }}
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all group
        ${isSelected
          ? 'bg-white/10 border border-white/10'
          : 'hover:bg-white/5 border border-transparent'
        }
      `}
    >
      {/* Route color indicator */}
      <div
        className="w-1 h-8 rounded-full shrink-0 transition-all"
        style={{
          backgroundColor: color,
          boxShadow: isSelected ? `0 0 8px ${color}` : 'none',
        }}
      />

      {/* Route badge */}
      <div
        className="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-bold"
        style={{
          backgroundColor: `${color}20`,
          color: color,
          border: `1px solid ${color}40`,
        }}
      >
        {route.short_name}
      </div>

      {/* Route name */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground truncate">{route.long_name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {route.stops.length} stops
        </div>
      </div>

      <ChevronRight
        className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : 'group-hover:translate-x-0.5'}`}
      />
    </motion.button>
  );
}
