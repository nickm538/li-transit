/*
 * NearbyStops — Find the 2 nearest bus stops from any point
 * Design: Transit Control Room — same map with all route overlays visible
 * Features: Pin drop, address search, device geolocation
 * Shows 2 nearest stops with route info, distance, walking time, and upcoming departures
 * Mobile: Bottom sheet results, responsive layout
 */
import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { MapView } from '@/components/Map';
import NavHeader from '@/components/NavHeader';
import { useTransit } from '@/contexts/TransitContext';
import {
  LI_CENTER, LI_BOUNDS,
  haversine, findNearestStops, findRoutesForStop,
  estimateWalkTime, formatDistance, formatDuration,
  getDayType, parseGtfsTime, formatTime, getCurrentMinutes,
} from '@/lib/transitData';
import type { TransitRoute, TransitStop } from '@/lib/transitData';
import {
  MapPin, LocateFixed, Loader2, Crosshair, X, Footprints,
  Bus, Clock, GripHorizontal, Navigation, Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface NearbyResult {
  stop: TransitStop;
  distance: number;
  walkTime: number;
  routes: { route: TransitRoute; color: string }[];
  upcomingDepartures: { routeName: string; time: string; color: string }[];
}

export default function NearbyStops() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const walkPolylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const { routes, routeColors, schedules, loading, schedulesLoading } = useTransit();

  const [locationText, setLocationText] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [results, setResults] = useState<NearbyResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [selectedStopIdx, setSelectedStopIdx] = useState<number | null>(null);

  // Refs for map click handler
  const dropModeRef = useRef(false);
  useEffect(() => { dropModeRef.current = dropMode; }, [dropMode]);

  // All stops flattened (deduplicated)
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

  // Reverse geocode
  const reverseGeocode = useCallback(async (coords: { lat: number; lng: number }): Promise<string> => {
    if (!geocoderRef.current) return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    return new Promise((resolve) => {
      geocoderRef.current!.geocode({ location: coords }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          resolve(results[0].formatted_address);
        } else {
          resolve(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        }
      });
    });
  }, []);

  // Get walking path from Google Directions
  const getWalkingPath = useCallback(async (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): Promise<google.maps.LatLng[] | null> => {
    if (!directionsServiceRef.current) return null;
    return new Promise((resolve) => {
      directionsServiceRef.current!.route(
        {
          origin: from,
          destination: to,
          travelMode: google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (status === 'OK' && result?.routes?.[0]?.overview_path) {
            resolve(result.routes[0].overview_path);
          } else {
            resolve(null);
          }
        }
      );
    });
  }, []);

  // Find 2 nearest stops and their info
  const findNearby = useCallback((coords: { lat: number; lng: number }) => {
    if (allStops.length === 0) {
      toast.error('Transit data is still loading...');
      return;
    }

    const nearest = findNearestStops(coords.lat, coords.lng, allStops, 2, 10);

    if (nearest.length === 0) {
      toast.info('No bus stops found within 10 miles of this location.');
      setResults([]);
      return;
    }

    const dayType = getDayType();
    const nowMinutes = getCurrentMinutes();

    const nearbyResults: NearbyResult[] = nearest.map(({ stop, distance }) => {
      const servingRoutes = findRoutesForStop(stop.id, routes);
      const routeInfo = servingRoutes.map(r => ({
        route: r,
        color: routeColors.get(r.id) || '#00D4FF',
      }));

      // Find upcoming departures from this stop
      const upcomingDepartures: { routeName: string; time: string; color: string }[] = [];

      for (const r of servingRoutes) {
        const sched = schedules[r.id];
        if (!sched) continue;
        const trips = sched[dayType] || [];

        for (const trip of trips) {
          const stopTime = trip.stops.find(s => s.stop_id === stop.id);
          if (stopTime) {
            const depMin = parseGtfsTime(stopTime.departure).totalMinutes;
            if (depMin >= nowMinutes && depMin <= nowMinutes + 120) {
              upcomingDepartures.push({
                routeName: r.short_name,
                time: stopTime.departure,
                color: routeColors.get(r.id) || '#00D4FF',
              });
            }
          }
        }
      }

      // Sort by departure time and limit
      upcomingDepartures.sort((a, b) => {
        return parseGtfsTime(a.time).totalMinutes - parseGtfsTime(b.time).totalMinutes;
      });

      return {
        stop,
        distance,
        walkTime: estimateWalkTime(distance),
        routes: routeInfo,
        upcomingDepartures: upcomingDepartures.slice(0, 6),
      };
    });

    setResults(nearbyResults);
    setSelectedStopIdx(0);
    toast.success(`Found ${nearbyResults.length} nearby stop${nearbyResults.length > 1 ? 's' : ''}!`);
  }, [allStops, routes, routeColors, schedules]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    directionsServiceRef.current = new google.maps.DirectionsService();
    infoWindowRef.current = new google.maps.InfoWindow();

    map.setOptions({
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
      minZoom: 9,
      maxZoom: 20,
      restriction: {
        latLngBounds: { north: 41.3, south: 40.3, east: -71.5, west: -74.0 },
        strictBounds: false,
      },
    });

    // Click to drop pin or set location
    map.addListener('click', async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const coords = { lat, lng };

      if (dropModeRef.current) {
        setDropMode(false);
      }

      setLocationCoords(coords);
      const addr = await reverseGeocode(coords);
      setLocationText(addr);
      toast.success('Location set — finding nearby stops...');
    });

    // Setup Google Places Autocomplete
    if (inputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        bounds: new google.maps.LatLngBounds(
          { lat: LI_BOUNDS.south, lng: LI_BOUNDS.west },
          { lat: LI_BOUNDS.north, lng: LI_BOUNDS.east }
        ),
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'geometry', 'name'],
        strictBounds: false,
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          const coords = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          };
          setLocationCoords(coords);
          setLocationText(place.formatted_address || place.name || '');
        }
      });
      autocompleteRef.current = autocomplete;
    }

    setMapReady(true);
  }, [reverseGeocode]);

  // Use device location
  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setLocating(true);
    toast.info('Requesting your location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocationCoords(coords);
        const addr = await reverseGeocode(coords);
        setLocationText(addr);
        setLocating(false);
        toast.success('Location found!');
        if (mapRef.current) {
          mapRef.current.panTo(coords);
          mapRef.current.setZoom(14);
        }
      },
      (err) => {
        setLocating(false);
        let msg = 'Could not get your location.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = 'Location permission denied. Please enable location services in your browser/device settings.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Location information is unavailable.';
            break;
          case err.TIMEOUT:
            msg = 'Location request timed out.';
            break;
        }
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [reverseGeocode]);

  // Auto-search when coordinates change
  useEffect(() => {
    if (locationCoords && allStops.length > 0) {
      findNearby(locationCoords);
    }
  }, [locationCoords, findNearby]);

  // Draw all routes on map (dimmed background) + highlight nearby stops
  useEffect(() => {
    if (!mapReady || !mapRef.current || routes.length === 0) return;

    // Clear existing route polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const hasResults = results.length > 0;

    // Draw all routes as background
    routes.forEach(route => {
      if (!route.shape || route.shape.length < 2) return;
      const color = routeColors.get(route.id) || '#00D4FF';

      // Check if this route serves any of the nearby stops
      const servesNearby = hasResults && results.some(r =>
        r.routes.some(rr => rr.route.id === route.id)
      );

      const line = new google.maps.Polyline({
        path: route.shape.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: color,
        strokeOpacity: servesNearby ? 0.9 : hasResults ? 0.15 : 0.5,
        strokeWeight: servesNearby ? 4 : 2,
        map: mapRef.current,
        zIndex: servesNearby ? 10 : 1,
      });

      if (servesNearby) {
        // Add glow for highlighted routes
        const glow = new google.maps.Polyline({
          path: route.shape.map(([lat, lng]) => ({ lat, lng })),
          geodesic: true,
          strokeColor: color,
          strokeOpacity: 0.3,
          strokeWeight: 10,
          map: mapRef.current,
          zIndex: 9,
        });
        polylinesRef.current.push(glow);
      }

      polylinesRef.current.push(line);
    });
  }, [mapReady, routes, routeColors, results]);

  // Draw markers for user location and nearby stops + walking paths
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // Clear existing markers and walk lines
    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];
    walkPolylinesRef.current.forEach(p => p.setMap(null));
    walkPolylinesRef.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();

    const map = mapRef.current;
    const bounds = new google.maps.LatLngBounds();

    // User location marker
    if (locationCoords) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:#0D1117;border:2px solid #00FF88;border-radius:6px;padding:2px 8px;margin-bottom:4px;white-space:nowrap;">
            <span style="color:#00FF88;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;">YOU</span>
          </div>
          <div style="width:22px;height:22px;border-radius:50%;background:#00FF88;border:3px solid #0D1117;box-shadow:0 0 16px #00FF8880;"></div>
          <div style="width:40px;height:40px;border-radius:50%;border:2px solid #00FF8840;position:absolute;top:14px;animation:pulse 2s infinite;"></div>
        </div>
      `;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: locationCoords,
        content: el.firstElementChild as HTMLElement,
        title: 'Your Location',
        zIndex: 100,
      });
      markersRef.current.push(marker);
      bounds.extend(locationCoords);
    }

    // Nearby stop markers
    if (results.length > 0) {
      const drawWalkPaths = async () => {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const isSelected = selectedStopIdx === i;
          const stopColor = result.routes[0]?.color || '#00D4FF';
          const stopNum = i + 1;

          // Stop marker
          const el = document.createElement('div');
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
              <div style="
                background:#0D1117;
                border:2px solid ${stopColor};
                border-radius:8px;
                padding:4px 10px;
                margin-bottom:4px;
                white-space:nowrap;
                box-shadow:0 0 12px ${stopColor}40;
                ${isSelected ? `box-shadow:0 0 20px ${stopColor}80;` : ''}
              ">
                <div style="color:${stopColor};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;text-align:center;">
                  STOP ${stopNum}
                </div>
                <div style="color:#E6EDF3;font-family:'JetBrains Mono',monospace;font-size:9px;text-align:center;margin-top:1px;max-width:160px;overflow:hidden;text-overflow:ellipsis;">
                  ${result.stop.name}
                </div>
                <div style="color:#8B949E;font-family:'JetBrains Mono',monospace;font-size:8px;text-align:center;margin-top:2px;">
                  ${formatDistance(result.distance)} · ${result.walkTime} min walk
                </div>
              </div>
              <div style="
                width:${isSelected ? 18 : 14}px;
                height:${isSelected ? 18 : 14}px;
                border-radius:50%;
                background:${stopColor};
                border:3px solid #0D1117;
                box-shadow:0 0 12px ${stopColor}80;
                transition:all 0.2s;
              "></div>
            </div>
          `;

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: result.stop.lat, lng: result.stop.lon },
            content: el.firstElementChild as HTMLElement,
            title: result.stop.name,
            zIndex: isSelected ? 90 : 50,
          });

          // Click handler — show full info
          marker.addListener('click', () => {
            setSelectedStopIdx(i);
            if (infoWindowRef.current && map) {
              const routeList = result.routes.map(r =>
                `<span style="color:${r.color};font-weight:bold;">${r.route.short_name}</span>`
              ).join(', ');

              const depList = result.upcomingDepartures.length > 0
                ? result.upcomingDepartures.slice(0, 4).map(d =>
                    `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                      <span style="color:${d.color};font-weight:bold;font-size:10px;">Route ${d.routeName}</span>
                      <span style="color:#E6EDF3;font-size:10px;">${formatTime(d.time)}</span>
                    </div>`
                  ).join('')
                : '<div style="color:#8B949E;font-size:10px;margin-top:2px;">No departures in next 2 hours</div>';

              infoWindowRef.current.setContent(`
                <div style="background:#0D1117;color:#E6EDF3;padding:12px 16px;border-radius:10px;font-family:'JetBrains Mono',monospace;min-width:220px;border:1px solid ${stopColor}40;box-shadow:0 4px 24px rgba(0,0,0,0.5);">
                  <div style="font-size:14px;font-weight:bold;color:${stopColor};margin-bottom:4px;">${result.stop.name}</div>
                  <div style="font-size:10px;color:#8B949E;margin-bottom:8px;">
                    ${formatDistance(result.distance)} away · ${result.walkTime} min walk
                  </div>
                  <div style="font-size:10px;color:#8B949E;margin-bottom:4px;">Routes: ${routeList}</div>
                  <div style="border-top:1px solid #30363D;margin-top:6px;padding-top:6px;">
                    <div style="font-size:9px;color:#8B949E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Upcoming Departures</div>
                    ${depList}
                  </div>
                  <div style="font-size:9px;color:#484F58;margin-top:6px;">
                    ${result.stop.lat.toFixed(5)}, ${result.stop.lon.toFixed(5)}
                  </div>
                </div>
              `);
              infoWindowRef.current.open(map, marker);
            }
          });

          markersRef.current.push(marker);
          bounds.extend({ lat: result.stop.lat, lng: result.stop.lon });

          // Draw walking path from user to this stop
          if (locationCoords) {
            const stopPos = { lat: result.stop.lat, lng: result.stop.lon };
            const walkPath = await getWalkingPath(locationCoords, stopPos);

            const pathPoints = walkPath || [
              new google.maps.LatLng(locationCoords.lat, locationCoords.lng),
              new google.maps.LatLng(stopPos.lat, stopPos.lng),
            ];

            // Dashed walking line
            const walkLine = new google.maps.Polyline({
              path: pathPoints,
              geodesic: true,
              strokeColor: stopColor,
              strokeOpacity: 0,
              strokeWeight: 3,
              map,
              zIndex: 15,
              icons: [{
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: isSelected ? 0.9 : 0.5,
                  strokeColor: stopColor,
                  scale: 3,
                },
                offset: '0',
                repeat: '10px',
              }],
            });
            walkPolylinesRef.current.push(walkLine);
          }
        }

        // Fit bounds
        if (!bounds.isEmpty()) {
          const isMobile = window.innerWidth < 768;
          map.fitBounds(bounds, isMobile
            ? { top: 80, bottom: 280, left: 20, right: 20 }
            : { top: 80, bottom: 40, left: 40, right: 420 }
          );
        }
      };

      drawWalkPaths();
    } else if (locationCoords) {
      // Just user location, zoom in
      map.panTo(locationCoords);
      map.setZoom(14);
    }
  }, [mapReady, locationCoords, results, selectedStopIdx, getWalkingPath]);

  const currentDayType = getDayType();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-background relative flex flex-col">
      <NavHeader />

      {/* Map — fully interactive */}
      <div className="flex-1 relative mt-14 map-container">
        <MapView
          className="w-full h-full"
          initialCenter={LI_CENTER}
          initialZoom={10}
          onMapReady={handleMapReady}
        />

        {/* Drop mode indicator */}
        <AnimatePresence>
          {dropMode && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 glass-panel rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Crosshair className="w-4 h-4" style={{ color: '#788c5d' }} />
              <span className="text-xs text-foreground" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                Tap map to set your location
              </span>
              <button
                onClick={() => setDropMode(false)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Schedule loading indicator */}
        {schedulesLoading && (
          <div className="absolute top-2 right-2 z-30 glass-panel rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#d97757' }} />
            <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>Loading schedules...</span>
          </div>
        )}
      </div>

      {/* Panel — bottom sheet on mobile, side panel on desktop */}
      <div className={`
        md:absolute md:top-16 md:right-3 md:bottom-3 md:w-96 md:rounded-lg
        w-full z-30 glass-panel overflow-hidden flex flex-col
        ${panelExpanded ? 'max-h-[60dvh] md:max-h-none' : 'max-h-[120px] md:max-h-none'}
        transition-all duration-300 ease-in-out
        rounded-t-2xl md:rounded-lg
      `}>
        {/* Mobile drag handle */}
        <button
          onClick={() => setPanelExpanded(!panelExpanded)}
          className="md:hidden flex items-center justify-center py-1.5 border-b border-border/30"
        >
          <GripHorizontal className="w-6 h-2 text-muted-foreground" />
        </button>

        {/* Input section */}
        <div className="p-3 md:p-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: '#788c5d' }} />
              <span className="text-xs font-medium tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#788c5d' }}>
                Nearby Stops
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <Calendar className="w-3 h-3" />
              <span>{dayStr} &middot; {timeStr}</span>
            </div>
          </div>

          {/* Location input */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: '#788c5d' }} />
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter address or tap the map..."
                value={locationText}
                onChange={e => { setLocationText(e.target.value); setLocationCoords(null); }}
                className="w-full h-9 px-3 pr-8 text-xs bg-background/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#788c5d]/40"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
              />
              {locationText && (
                <button
                  onClick={() => { setLocationText(''); setLocationCoords(null); setResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-1.5 mt-1.5 ml-5">
            <button
              onClick={useMyLocation}
              disabled={locating}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors disabled:opacity-50"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", background: 'rgba(120,140,93,0.1)', color: '#788c5d', border: '1px solid rgba(120,140,93,0.2)' }}
            >
              {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
              My Location
            </button>
            <button
              onClick={() => { setDropMode(!dropMode); if (!dropMode) toast.info('Tap the map to set your location'); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                ...(dropMode
                  ? { background: 'rgba(106,155,204,0.15)', color: '#6a9bcc', border: '1px solid rgba(106,155,204,0.3)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#b0aea5', border: '1px solid rgba(255,255,255,0.08)' })
              }}
            >
              <Crosshair className="w-3 h-3" />
              Drop Pin
            </button>
          </div>

          {/* Hint text */}
          {!locationCoords && results.length === 0 && (
            <div className="mt-2 text-[10px] text-muted-foreground/60 ml-5" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>
              Tip: You can also tap anywhere on the map to find nearby stops
            </div>
          )}
        </div>

        {/* Results — scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-3">
            <AnimatePresence>
              {results.map((result, i) => {
                const isSelected = selectedStopIdx === i;
                const stopColor = result.routes[0]?.color || '#00D4FF';

                return (
                  <motion.button
                    key={result.stop.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => {
                      setSelectedStopIdx(i);
                      if (mapRef.current) {
                        mapRef.current.panTo({ lat: result.stop.lat, lng: result.stop.lon });
                        mapRef.current.setZoom(15);
                      }
                    }}
                    className={`
                      w-full text-left p-3 rounded-lg mb-2 transition-all border
                      ${isSelected
                        ? 'bg-white/10 border-[#788c5d]/30 ring-1 ring-[#788c5d]/15'
                        : 'bg-white/4 border-transparent hover:bg-white/6 hover:border-border/30'
                      }
                    `}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                          style={{ backgroundColor: `${stopColor}20`, color: stopColor, border: `1.5px solid ${stopColor}` }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-foreground leading-tight">
                            {result.stop.name}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {result.stop.lat.toFixed(5)}, {result.stop.lon.toFixed(5)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Distance & walk time */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-1 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#788c5d' }}>
                        <Footprints className="w-3 h-3" />
                        <span>{formatDistance(result.distance)}</span>
                        <span className="text-muted-foreground">&middot;</span>
                        <span>{result.walkTime} min walk</span>
                      </div>
                    </div>

                    {/* Serving routes */}
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {result.routes.map(({ route, color }) => (
                        <div
                          key={route.id}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                          style={{
                            backgroundColor: `${color}20`,
                            color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          <Bus className="w-3 h-3" />
                          {route.short_name}
                        </div>
                      ))}
                    </div>

                    {/* Upcoming departures */}
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="pt-2 border-t border-border/30 overflow-hidden"
                      >
                        <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Upcoming Departures (next 2 hrs)
                        </div>
                        {result.upcomingDepartures.length > 0 ? (
                          <div className="space-y-1">
                            {result.upcomingDepartures.map((dep, j) => (
                              <div key={j} className="flex items-center gap-2">
                                <div
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
                                  style={{ backgroundColor: `${dep.color}20`, color: dep.color }}
                                >
                                  {dep.routeName}
                                </div>
                                <span className="text-[10px] font-mono text-foreground">
                                  {formatTime(dep.time)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-muted-foreground/60">
                            No departures scheduled in the next 2 hours
                          </div>
                        )}

                        {/* Route details */}
                        <div className="mt-2 pt-2 border-t border-border/20">
                          <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                            Routes serving this stop
                          </div>
                          {result.routes.map(({ route, color }) => (
                            <div key={route.id} className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              <span style={{ color }} className="font-bold">{route.short_name}</span>
                              <span className="ml-1">{route.long_name}</span>
                              <span className="ml-1 text-muted-foreground/50">({route.county})</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>

            {results.length === 0 && !loading && (
              <div className="text-center py-8 md:py-12">
                <Navigation className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-xs text-muted-foreground font-mono">
                  Set your location to find nearby bus stops
                </div>
                <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                  Use your device location, type an address, or tap the map
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
