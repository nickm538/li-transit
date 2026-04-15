/*
 * TripPlanner — Point A to Point B transit routing
 * Design: Transit Control Room — clean map with floating input panels
 * Features: Geolocation, address input, pin drop, optimal route calculation
 */
import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { MapView } from '@/components/Map';
import NavHeader from '@/components/NavHeader';
import { useTransit } from '@/contexts/TransitContext';
import { LI_CENTER, findNearestStop, haversine, getDayType, formatTime, parseGtfsTime } from '@/lib/transitData';
import type { TransitRoute, TransitStop } from '@/lib/transitData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, Navigation, Crosshair, Search, ArrowRight, Clock,
  Footprints, Bus, LocateFixed, Loader2, Route as RouteIcon, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';



interface TripResult {
  segments: TripSegment[];
  totalDistance: number;
  totalDuration: number;
  departureTime: string;
  arrivalTime: string;
}

interface TripSegment {
  type: 'walk' | 'bus';
  route?: TransitRoute;
  fromStop?: TransitStop;
  toStop?: TransitStop;
  fromName: string;
  toName: string;
  distance: number;
  duration: number;
  departureTime?: string;
  arrivalTime?: string;
  stopsCount?: number;
  color?: string;
}

export default function TripPlanner() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  const { routes, routeColors, schedules, loading } = useTransit();

  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TripResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [dropMode, setDropMode] = useState<'origin' | 'dest' | null>(null);

  // All stops flattened
  const allStops = useMemo(() => {
    const stops: TransitStop[] = [];
    const seen = new Set<string>();
    routes.forEach(r => {
      r.stops.forEach(s => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          stops.push(s);
        }
      });
    });
    return stops;
  }, [routes]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    map.setOptions({
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
      minZoom: 9,
      maxZoom: 20,
    });

    // Click to drop pin
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      if (dropMode === 'origin' || (!originCoords && !dropMode)) {
        setOriginCoords({ lat, lng });
        setOriginText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setDropMode(null);
        toast.success('Origin set');
      } else if (dropMode === 'dest' || (!destCoords && originCoords)) {
        setDestCoords({ lat, lng });
        setDestText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setDropMode(null);
        toast.success('Destination set');
      }
    });

    setMapReady(true);
  }, [dropMode, originCoords, destCoords]);

  // Geocode address
  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!geocoderRef.current) return null;
    return new Promise((resolve) => {
      geocoderRef.current!.geocode(
        { address: address + ', Long Island, NY' },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
          } else {
            resolve(null);
          }
        }
      );
    });
  }, []);

  // Use device location
  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOriginCoords(coords);
        setOriginText('My Location');
        setLocating(false);
        toast.success('Location found');
        if (mapRef.current) {
          mapRef.current.panTo(coords);
          mapRef.current.setZoom(14);
        }
      },
      (err) => {
        setLocating(false);
        toast.error('Could not get location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Find transit routes between two points
  const findRoutes = useCallback(async () => {
    let origin = originCoords;
    let dest = destCoords;

    // Geocode if needed
    if (!origin && originText) {
      origin = await geocodeAddress(originText);
      if (origin) setOriginCoords(origin);
    }
    if (!dest && destText) {
      dest = await geocodeAddress(destText);
      if (dest) setDestCoords(dest);
    }

    if (!origin || !dest) {
      toast.error('Please set both origin and destination');
      return;
    }

    setSearching(true);
    setResults([]);
    setSelectedResult(null);

    try {
      // Find nearest stops to origin and destination
      const nearOrigin = findNearestStop(origin.lat, origin.lng, allStops);
      const nearDest = findNearestStop(dest.lat, dest.lng, allStops);

      if (!nearOrigin || !nearDest) {
        toast.error('No bus stops found nearby');
        setSearching(false);
        return;
      }

      const dayType = getDayType();
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // Find routes that serve both origin and destination stops (or nearby)
      const tripResults: TripResult[] = [];

      // Strategy 1: Direct routes
      for (const route of routes) {
        const originStopIdx = route.stops.findIndex(s =>
          haversine(s.lat, s.lon, origin!.lat, origin!.lng) < 0.5
        );
        const destStopIdx = route.stops.findIndex(s =>
          haversine(s.lat, s.lon, dest!.lat, dest!.lng) < 0.5
        );

        if (originStopIdx >= 0 && destStopIdx >= 0 && originStopIdx !== destStopIdx) {
          const originStop = route.stops[originStopIdx];
          const destStop = route.stops[destStopIdx];
          const color = routeColors.get(route.id) || '#00D4FF';

          // Get schedule for this route
          const routeSched = schedules[route.id];
          if (!routeSched) continue;
          const trips = routeSched[dayType] || [];

          // Find next available trip
          for (const trip of trips) {
            const originStopTime = trip.stops.find(s => s.stop_id === originStop.id);
            const destStopTime = trip.stops.find(s => s.stop_id === destStop.id);

            if (originStopTime && destStopTime) {
              const depMinutes = parseGtfsTime(originStopTime.departure).totalMinutes;
              const arrMinutes = parseGtfsTime(destStopTime.arrival).totalMinutes;

              if (depMinutes >= nowMinutes && arrMinutes > depMinutes) {
                const walkToStop = haversine(origin!.lat, origin!.lng, originStop.lat, originStop.lon);
                const walkFromStop = haversine(dest!.lat, dest!.lng, destStop.lat, destStop.lon);
                const busDistance = haversine(originStop.lat, originStop.lon, destStop.lat, destStop.lon);
                const stopsCount = Math.abs(destStopIdx - originStopIdx);

                const segments: TripSegment[] = [];

                // Walk to stop
                if (walkToStop > 0.05) {
                  segments.push({
                    type: 'walk',
                    fromName: 'Your Location',
                    toName: originStop.name,
                    distance: walkToStop,
                    duration: Math.round(walkToStop / 0.05), // ~3mph walking
                  });
                }

                // Bus ride
                segments.push({
                  type: 'bus',
                  route,
                  fromStop: originStop,
                  toStop: destStop,
                  fromName: originStop.name,
                  toName: destStop.name,
                  distance: busDistance,
                  duration: arrMinutes - depMinutes,
                  departureTime: originStopTime.departure,
                  arrivalTime: destStopTime.arrival,
                  stopsCount,
                  color,
                });

                // Walk from stop
                if (walkFromStop > 0.05) {
                  segments.push({
                    type: 'walk',
                    fromName: destStop.name,
                    toName: 'Destination',
                    distance: walkFromStop,
                    duration: Math.round(walkFromStop / 0.05),
                  });
                }

                const totalDist = walkToStop + busDistance + walkFromStop;
                const walkTime = Math.round((walkToStop + walkFromStop) / 0.05);
                const totalDuration = walkTime + (arrMinutes - depMinutes);

                tripResults.push({
                  segments,
                  totalDistance: totalDist,
                  totalDuration,
                  departureTime: originStopTime.departure,
                  arrivalTime: destStopTime.arrival,
                });

                break; // Take first available trip for this route
              }
            }
          }
        }
      }

      // Strategy 2: If no direct routes, find nearest-stop-based options
      if (tripResults.length === 0 && nearOrigin && nearDest) {
        // Find routes serving origin stop
        const originRoutes = routes.filter(r =>
          r.stops.some(s => s.id === nearOrigin.stop.id)
        );

        for (const route of originRoutes) {
          const color = routeColors.get(route.id) || '#00D4FF';
          const originStopIdx = route.stops.findIndex(s => s.id === nearOrigin.stop.id);
          // Find closest stop to destination on this route
          let bestDestIdx = -1;
          let bestDestDist = Infinity;
          route.stops.forEach((s, idx) => {
            if (idx === originStopIdx) return;
            const d = haversine(s.lat, s.lon, dest!.lat, dest!.lng);
            if (d < bestDestDist) {
              bestDestDist = d;
              bestDestIdx = idx;
            }
          });

          if (bestDestIdx >= 0 && bestDestDist < 2) {
            const destStop = route.stops[bestDestIdx];
            const walkToStop = nearOrigin.distance;
            const walkFromStop = bestDestDist;
            const stopsCount = Math.abs(bestDestIdx - originStopIdx);

            const segments: TripSegment[] = [];
            if (walkToStop > 0.05) {
              segments.push({
                type: 'walk',
                fromName: 'Your Location',
                toName: nearOrigin.stop.name,
                distance: walkToStop,
                duration: Math.round(walkToStop / 0.05),
              });
            }
            segments.push({
              type: 'bus',
              route,
              fromStop: nearOrigin.stop,
              toStop: destStop,
              fromName: nearOrigin.stop.name,
              toName: destStop.name,
              distance: haversine(nearOrigin.stop.lat, nearOrigin.stop.lon, destStop.lat, destStop.lon),
              duration: Math.round(stopsCount * 2.5),
              stopsCount,
              color,
            });
            if (walkFromStop > 0.05) {
              segments.push({
                type: 'walk',
                fromName: destStop.name,
                toName: 'Destination',
                distance: walkFromStop,
                duration: Math.round(walkFromStop / 0.05),
              });
            }

            const totalDist = walkToStop + haversine(nearOrigin.stop.lat, nearOrigin.stop.lon, destStop.lat, destStop.lon) + walkFromStop;
            const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

            tripResults.push({
              segments,
              totalDistance: totalDist,
              totalDuration,
              departureTime: '',
              arrivalTime: '',
            });
          }
        }
      }

      // Also add walking-only option
      const directWalkDist = haversine(origin.lat, origin.lng, dest.lat, dest.lng);
      if (directWalkDist < 5) {
        tripResults.push({
          segments: [{
            type: 'walk',
            fromName: 'Your Location',
            toName: 'Destination',
            distance: directWalkDist,
            duration: Math.round(directWalkDist / 0.05),
          }],
          totalDistance: directWalkDist,
          totalDuration: Math.round(directWalkDist / 0.05),
          departureTime: '',
          arrivalTime: '',
        });
      }

      // Sort by total duration
      tripResults.sort((a, b) => a.totalDuration - b.totalDuration);
      setResults(tripResults.slice(0, 5));

      if (tripResults.length === 0) {
        toast.info('No transit routes found for this trip. Try different locations.');
      }
    } catch (err) {
      toast.error('Error finding routes');
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, [originCoords, destCoords, originText, destText, routes, routeColors, schedules, allStops, geocodeAddress]);

  // Update map markers and route display
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // Clear
    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    // Origin marker
    if (originCoords) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:#00FF88;border:3px solid #0D1117;box-shadow:0 0 12px #00FF8880;"></div>`;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: originCoords,
        content: el.firstElementChild as HTMLElement,
        title: 'Origin',
      });
      markersRef.current.push(marker);
    }

    // Destination marker
    if (destCoords) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:#FF4444;border:3px solid #0D1117;box-shadow:0 0 12px #FF444480;"></div>`;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: destCoords,
        content: el.firstElementChild as HTMLElement,
        title: 'Destination',
      });
      markersRef.current.push(marker);
    }

    // Show selected result route on map
    if (selectedResult !== null && results[selectedResult]) {
      const result = results[selectedResult];
      const bounds = new google.maps.LatLngBounds();
      if (originCoords) bounds.extend(originCoords);
      if (destCoords) bounds.extend(destCoords);

      result.segments.forEach(seg => {
        if (seg.type === 'bus' && seg.route) {
          const color = seg.color || '#00D4FF';
          const line = new google.maps.Polyline({
            path: seg.route.shape.map(([lat, lng]) => ({ lat, lng })),
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map: mapRef.current,
            zIndex: 10,
          });
          polylinesRef.current.push(line);

          // Glow
          const glow = new google.maps.Polyline({
            path: seg.route.shape.map(([lat, lng]) => ({ lat, lng })),
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 0.3,
            strokeWeight: 10,
            map: mapRef.current,
            zIndex: 9,
          });
          polylinesRef.current.push(glow);

          seg.route.shape.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        }

        if (seg.type === 'walk') {
          // Dashed walk line
          const walkPath = [];
          if (seg.fromStop) walkPath.push({ lat: seg.fromStop.lat, lng: seg.fromStop.lon });
          if (seg.toStop) walkPath.push({ lat: seg.toStop.lat, lng: seg.toStop.lon });
          // Simple walk line from origin/dest
          if (walkPath.length < 2) {
            if (seg.fromName === 'Your Location' && originCoords && seg.toStop) {
              walkPath.push(originCoords, { lat: seg.toStop.lat, lng: seg.toStop.lon });
            } else if (seg.toName === 'Destination' && destCoords && seg.fromStop) {
              walkPath.push({ lat: seg.fromStop.lat, lng: seg.fromStop.lon }, destCoords);
            }
          }
        }
      });

      mapRef.current.fitBounds(bounds, { top: 80, bottom: 20, left: 20, right: 420 });
    } else if (originCoords && destCoords) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(originCoords);
      bounds.extend(destCoords);
      mapRef.current.fitBounds(bounds, { top: 80, bottom: 20, left: 20, right: 420 });
    }
  }, [mapReady, originCoords, destCoords, results, selectedResult]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      <NavHeader />

      {/* Map */}
      <MapView
        className="w-full h-full"
        initialCenter={LI_CENTER}
        initialZoom={10}
        onMapReady={handleMapReady}
      />

      {/* Trip planner panel */}
      <div className="absolute top-16 right-3 bottom-3 w-80 md:w-96 z-30 glass-panel rounded-lg overflow-hidden flex flex-col">
        {/* Input section */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <RouteIcon className="w-4 h-4 text-[#00D4FF]" />
            <span className="font-mono text-xs font-bold tracking-wider text-[#00D4FF] uppercase">
              Plan Your Trip
            </span>
          </div>

          {/* Origin */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#00FF88] shrink-0" />
              <div className="flex-1 relative">
                <Input
                  placeholder="Starting location..."
                  value={originText}
                  onChange={e => { setOriginText(e.target.value); setOriginCoords(null); }}
                  className="h-9 text-xs bg-background/50 border-border/50 font-mono pr-8"
                />
                {originText && (
                  <button
                    onClick={() => { setOriginText(''); setOriginCoords(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-1.5 ml-5">
              <button
                onClick={useMyLocation}
                disabled={locating}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 hover:bg-[#00FF88]/20 transition-colors disabled:opacity-50"
              >
                {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
                My Location
              </button>
              <button
                onClick={() => { setDropMode('origin'); toast.info('Click the map to set origin'); }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors
                  ${dropMode === 'origin'
                    ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40'
                    : 'bg-white/5 text-muted-foreground border border-border/30 hover:bg-white/10'
                  }`}
              >
                <Crosshair className="w-3 h-3" />
                Drop Pin
              </button>
            </div>

            {/* Destination */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full bg-[#FF4444] shrink-0" />
              <div className="flex-1 relative">
                <Input
                  placeholder="Destination..."
                  value={destText}
                  onChange={e => { setDestText(e.target.value); setDestCoords(null); }}
                  className="h-9 text-xs bg-background/50 border-border/50 font-mono pr-8"
                />
                {destText && (
                  <button
                    onClick={() => { setDestText(''); setDestCoords(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-1.5 ml-5">
              <button
                onClick={() => { setDropMode('dest'); toast.info('Click the map to set destination'); }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors
                  ${dropMode === 'dest'
                    ? 'bg-[#FF4444]/20 text-[#FF4444] border border-[#FF4444]/40'
                    : 'bg-white/5 text-muted-foreground border border-border/30 hover:bg-white/10'
                  }`}
              >
                <Crosshair className="w-3 h-3" />
                Drop Pin
              </button>
            </div>
          </div>

          {/* Search button */}
          <Button
            onClick={findRoutes}
            disabled={searching || (!originText && !originCoords) || (!destText && !destCoords)}
            className="w-full mt-3 h-10 font-mono text-xs tracking-wider uppercase bg-[#00D4FF] hover:bg-[#00B4E6] text-[#0D1117] font-bold"
          >
            {searching ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" /> Find Routes</>
            )}
          </Button>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 custom-scrollbar">
          <div className="p-3">
            <AnimatePresence>
              {results.map((result, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => setSelectedResult(selectedResult === i ? null : i)}
                  className={`
                    w-full text-left p-3 rounded-lg mb-2 transition-all border
                    ${selectedResult === i
                      ? 'bg-white/10 border-[#00D4FF]/30'
                      : 'bg-white/5 border-transparent hover:bg-white/8 hover:border-border/30'
                    }
                  `}
                >
                  {/* Summary */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {result.segments.some(s => s.type === 'bus') ? (
                        <Bus className="w-4 h-4 text-[#00D4FF]" />
                      ) : (
                        <Footprints className="w-4 h-4 text-[#00FF88]" />
                      )}
                      <span className="font-mono text-sm font-bold text-foreground">
                        {result.totalDuration} min
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {result.totalDistance.toFixed(1)} mi
                    </span>
                  </div>

                  {/* Segment pills */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {result.segments.map((seg, j) => (
                      <div key={j} className="flex items-center gap-1">
                        {j > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                        {seg.type === 'walk' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono text-muted-foreground">
                            <Footprints className="w-3 h-3" />
                            {seg.duration}m
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                            style={{
                              backgroundColor: `${seg.color}20`,
                              color: seg.color,
                              border: `1px solid ${seg.color}40`,
                            }}
                          >
                            <Bus className="w-3 h-3" />
                            {seg.route?.short_name}
                            {seg.stopsCount && <span className="opacity-70">({seg.stopsCount} stops)</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {selectedResult === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-3 pt-3 border-t border-border/30 overflow-hidden"
                      >
                        {result.segments.map((seg, j) => (
                          <div key={j} className="flex items-start gap-2.5 py-1.5">
                            <div className="mt-0.5">
                              {seg.type === 'walk' ? (
                                <Footprints className="w-3.5 h-3.5 text-[#00FF88]" />
                              ) : (
                                <Bus className="w-3.5 h-3.5" style={{ color: seg.color }} />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-foreground">
                                {seg.type === 'walk'
                                  ? `Walk ${seg.distance.toFixed(2)} mi (${seg.duration} min)`
                                  : `Ride ${seg.route?.short_name} — ${seg.route?.long_name}`
                                }
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {seg.fromName} → {seg.toName}
                              </div>
                              {seg.departureTime && (
                                <div className="text-[10px] font-mono mt-0.5" style={{ color: seg.color }}>
                                  Departs {formatTime(seg.departureTime)} → Arrives {formatTime(seg.arrivalTime!)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </AnimatePresence>

            {results.length === 0 && !searching && (
              <div className="text-center py-12">
                <Navigation className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-xs text-muted-foreground font-mono">
                  Enter origin and destination to find transit routes
                </div>
                <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                  Use addresses, drop pins, or your device location
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
