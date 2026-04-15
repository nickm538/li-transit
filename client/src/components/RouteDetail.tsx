/*
 * RouteDetail — Expanded view when a route is selected
 * Shows stops, schedule, and route info in a glass panel
 */
import { useMemo } from 'react';
import { useTransit } from '@/contexts/TransitContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Clock, MapPin, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { getDayType, formatTime, type TripSchedule } from '@/lib/transitData';

export default function RouteDetail() {
  const { selectedRoute, setSelectedRoute, schedules, routeColors } = useTransit();

  const color = selectedRoute ? routeColors.get(selectedRoute.id) || '#00D4FF' : '#00D4FF';

  const dayType = getDayType();
  const dayLabel = dayType === 'weekday' ? 'Weekday' : dayType === 'saturday' ? 'Saturday' : 'Sunday';

  const routeSchedule = useMemo(() => {
    if (!selectedRoute || !schedules[selectedRoute.id]) return [];
    const sched = schedules[selectedRoute.id][dayType] || [];
    // Get next few trips from current time
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return sched.filter(trip => {
      if (!trip.stops[0]) return false;
      const parts = trip.stops[0].departure.split(':');
      const tripMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      return tripMinutes >= nowMinutes - 30;
    }).slice(0, 10);
  }, [selectedRoute, schedules, dayType]);

  if (!selectedRoute) return null;

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-16 right-3 bottom-3 w-80 md:w-96 z-30 glass-panel rounded-lg overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="px-3 py-1.5 rounded-md font-mono font-bold text-base"
              style={{
                backgroundColor: `${color}20`,
                color: color,
                border: `1px solid ${color}40`,
                boxShadow: `0 0 12px ${color}30`,
              }}
            >
              {selectedRoute.short_name}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{selectedRoute.long_name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono"
                  style={{ color: selectedRoute.county === 'Suffolk' ? '#00D4FF' : '#FFB020' }}
                >
                  {selectedRoute.county}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {selectedRoute.stops.length} stops
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setSelectedRoute(null)}
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 custom-scrollbar">
        {/* Schedule section */}
        <div className="p-4 border-b border-border/30">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-xs font-mono font-bold tracking-wider uppercase" style={{ color }}>
              {dayLabel} Schedule
            </span>
          </div>

          {routeSchedule.length > 0 ? (
            <div className="space-y-1.5">
              {routeSchedule.map((trip, i) => {
                const firstStop = trip.stops[0];
                const lastStop = trip.stops[trip.stops.length - 1];
                return (
                  <div
                    key={trip.trip_id}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 hover:bg-white/8 transition-colors"
                  >
                    <div className="font-mono text-xs">
                      <span className="text-foreground font-medium">
                        {formatTime(firstStop.departure)}
                      </span>
                      <span className="text-muted-foreground mx-1.5">&rarr;</span>
                      <span className="text-foreground font-medium">
                        {formatTime(lastStop.arrival)}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {trip.stops.length} stops
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground font-mono text-center py-4">
              {Object.keys(schedules).length === 0 ? 'Loading schedules...' : 'No upcoming trips today'}
            </div>
          )}
        </div>

        {/* Stops section */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-xs font-mono font-bold tracking-wider uppercase" style={{ color }}>
              Stops
            </span>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-[7px] top-3 bottom-3 w-0.5 rounded-full"
              style={{ backgroundColor: `${color}40` }}
            />

            <div className="space-y-0">
              {selectedRoute.stops.map((stop, i) => (
                <div key={stop.id} className="flex items-start gap-3 py-1.5 group">
                  {/* Stop dot */}
                  <div className="relative z-10 mt-0.5">
                    <div
                      className="w-[15px] h-[15px] rounded-full border-2 bg-background transition-all group-hover:scale-125"
                      style={{
                        borderColor: color,
                        boxShadow: `0 0 6px ${color}40`,
                      }}
                    />
                  </div>
                  {/* Stop info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate group-hover:text-white transition-colors">
                      {stop.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}
                    </div>
                  </div>
                  {/* Stop number */}
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">
                    #{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
