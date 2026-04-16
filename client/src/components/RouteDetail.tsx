/*
 * RouteDetail — Expanded view when a route is selected
 * Shows stops, schedule, and route info in a glass panel
 * Mobile: Bottom sheet, Desktop: Right side panel
 */
import { useMemo } from "react";
import { useTransit } from "@/contexts/TransitContext";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Clock,
  MapPin,
  GripHorizontal,
  ExternalLink,
  Info,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  formatTime,
  getActiveRoutePattern,
  getDayType,
} from "@/lib/transitData";

export default function RouteDetail() {
  const {
    selectedRoute,
    selectedRoutePatternId,
    setSelectedRoute,
    setSelectedRoutePatternId,
    schedules,
    routeColors,
    routeDetailsById,
  } = useTransit();

  const color = selectedRoute
    ? routeColors.get(selectedRoute.id) || "#6a9bcc"
    : "#6a9bcc";
  const dayType = getDayType();
  const dayLabel =
    dayType === "weekday"
      ? "Weekday"
      : dayType === "saturday"
        ? "Saturday"
        : "Sunday";
  const routeDetails = selectedRoute
    ? routeDetailsById[selectedRoute.id]
    : undefined;
  const activePattern = getActiveRoutePattern(
    routeDetails,
    dayType,
    selectedRoutePatternId
  );

  const routeSchedule = useMemo(() => {
    if (!selectedRoute) return [];
    const schedule = schedules[selectedRoute.id]?.[dayType] || [];
    const allowedTripIds = activePattern?.tripIdsByDay[dayType];
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return schedule
      .filter(trip => !allowedTripIds || allowedTripIds.includes(trip.trip_id))
      .filter(trip => {
        const firstStop = [...trip.stops].sort(
          (a, b) => a.sequence - b.sequence
        )[0];
        if (!firstStop) return false;
        const [hours, minutes] = firstStop.departure.split(":").map(Number);
        return hours * 60 + minutes >= nowMinutes - 30;
      })
      .slice(0, 10);
  }, [activePattern, dayType, schedules, selectedRoute]);

  if (!selectedRoute) return null;

  const displayedStops = activePattern?.stops || selectedRoute.stops;
  const displayedStopCount = displayedStops.length;
  const serviceNotes = routeDetails?.serviceNotes || [];

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="
        fixed md:absolute
        bottom-0 left-0 right-0 md:left-auto
        md:top-16 md:right-3 md:bottom-3 md:w-96
        max-h-[70dvh] md:max-h-none
        z-30 glass-panel rounded-t-2xl md:rounded-lg overflow-hidden flex flex-col
      "
    >
      <div className="md:hidden flex items-center justify-center py-1.5 border-b border-border/30">
        <GripHorizontal className="w-6 h-2 text-muted-foreground" />
      </div>

      <div className="p-3 md:p-4 border-b border-border/50 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="px-3 py-1.5 rounded-lg font-medium text-base shrink-0"
              style={{
                backgroundColor: `${color}20`,
                color,
                border: `1px solid ${color}40`,
                boxShadow: `0 0 12px ${color}30`,
              }}
            >
              {selectedRoute.short_name}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {selectedRoute.long_name}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono"
                  style={{
                    color:
                      selectedRoute.county === "Suffolk"
                        ? "#6a9bcc"
                        : "#d97757",
                  }}
                >
                  {selectedRoute.county}
                </Badge>
                <span
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {displayedStopCount} stops shown
                </span>
                {routeDetails?.frequencyLabel && (
                  <span
                    className="text-[10px] text-muted-foreground"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {routeDetails.frequencyLabel}
                  </span>
                )}
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

        {routeDetails && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-[10px] font-medium">
                {routeDetails.serviceLabel}
              </Badge>
              {activePattern && routeDetails.patterns.length > 1 && (
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {activePattern.label}
                </Badge>
              )}
            </div>

            {routeDetails.patterns.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {routeDetails.patterns.map(pattern => {
                  const isActive = activePattern?.id === pattern.id;
                  return (
                    <button
                      key={pattern.id}
                      onClick={() => setSelectedRoutePatternId(pattern.id)}
                      className="px-2.5 py-1 rounded-md text-[10px] text-left transition-colors border"
                      style={{
                        color: isActive ? color : "#b0aea5",
                        borderColor: isActive
                          ? `${color}55`
                          : "rgba(255,255,255,0.08)",
                        background: isActive
                          ? `${color}18`
                          : "rgba(255,255,255,0.03)",
                      }}
                    >
                      {pattern.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-lg border border-white/8 bg-white/4 p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <Info
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color }}
                />
                <div className="space-y-1 min-w-0">
                  {serviceNotes.map(note => (
                    <div
                      key={note}
                      className="text-[11px] text-muted-foreground leading-relaxed"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </div>
              {routeDetails.officialUrl && (
                <a
                  href={routeDetails.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium hover:opacity-80 transition-opacity"
                  style={{ color }}
                >
                  <ExternalLink className="w-3 h-3" />
                  {routeDetails.officialLabel}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 md:p-4 border-b border-border/30">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color }} />
            <span
              className="text-xs font-medium tracking-tight"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                color,
              }}
            >
              {dayLabel} Schedule
            </span>
          </div>

          {routeSchedule.length > 0 ? (
            <div className="space-y-1.5">
              {routeSchedule.map(trip => {
                const orderedStops = [...trip.stops].sort(
                  (a, b) => a.sequence - b.sequence
                );
                const firstStop = orderedStops[0];
                const lastStop = orderedStops[orderedStops.length - 1];
                return (
                  <div
                    key={trip.trip_id}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 hover:bg-white/8 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs">
                        <span className="text-foreground font-medium">
                          {formatTime(firstStop.departure)}
                        </span>
                        <span className="text-muted-foreground mx-1.5">
                          &rarr;
                        </span>
                        <span className="text-foreground font-medium">
                          {formatTime(lastStop.arrival)}
                        </span>
                      </div>
                      {activePattern && (
                        <div className="text-[10px] text-muted-foreground truncate mt-1">
                          {activePattern.label}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[10px] text-muted-foreground shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {orderedStops.length} stops
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground font-mono text-center py-4">
              {Object.keys(schedules).length === 0
                ? "Loading schedules..."
                : "No upcoming trips for this pattern today"}
            </div>
          )}
        </div>

        <div className="p-3 md:p-4 pb-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-3.5 h-3.5" style={{ color }} />
            <span
              className="text-xs font-medium tracking-tight"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                color,
              }}
            >
              {activePattern ? "Scheduled Stops" : "Stops"}
            </span>
          </div>

          <div className="relative">
            <div
              className="absolute left-[7px] top-3 bottom-3 w-0.5 rounded-full"
              style={{ backgroundColor: `${color}40` }}
            />

            <div className="space-y-0">
              {displayedStops.map((stop, i) => (
                <div
                  key={`${activePattern?.id || selectedRoute.id}-${stop.id}-${i}`}
                  className="flex items-start gap-3 py-1.5 group"
                >
                  <div className="relative z-10 mt-0.5">
                    <div
                      className="w-[15px] h-[15px] rounded-full border-2 bg-background transition-all group-hover:scale-125"
                      style={{
                        borderColor: color,
                        boxShadow: `0 0 6px ${color}40`,
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate group-hover:text-white transition-colors">
                      {stop.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">
                    #{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
