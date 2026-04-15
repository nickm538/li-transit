/*
 * TripPlanner — Point A to Point B transit routing
 * Design: Transit Control Room — clean map with floating input panels
 * Features: Geolocation, Google Places Autocomplete, pin drop, optimal route calculation
 * Routing: Schedule-aware, multi-strategy (direct, transfer, walk/bike), holiday-aware
 * Mobile: Full-screen map with bottom sheet panel, proper scrolling
 */
import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { MapView } from '@/components/Map';
import NavHeader from '@/components/NavHeader';
import { useTransit } from '@/contexts/TransitContext';
import {
  LI_CENTER, LI_BOUNDS,
  haversine, getDayType, formatTime, parseGtfsTime,
  findNearestStops, findClosestStopOnRoute, findRoutesForStop,
  estimateWalkTime, estimateBikeTime, isWalkable, isBikeable,
  getCurrentMinutes, formatDuration, formatDistance,
} from '@/lib/transitData';
import type { TransitRoute, TransitStop, RouteSchedule, TripSchedule } from '@/lib/transitData';
import { Button } from '@/components/ui/button';
import {
  MapPin, Navigation, Crosshair, Search, ArrowRight, Clock,
  Footprints, Bus, LocateFixed, Loader2, Route as RouteIcon, X,
  GripHorizontal, Bike, AlertTriangle, Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface TripResult {
  segments: TripSegment[];
  totalDistance: number;
  totalDuration: number;
  departureTime: string;
  arrivalTime: string;
  walkOnly?: boolean;
  bikeOnly?: boolean;
  label?: string;
}

interface TripSegment {
  type: 'walk' | 'bus' | 'bike';
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
  stopsBetween?: TransitStop[];
}

export default function TripPlanner() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const originInputRef = useRef<HTMLInputElement | null>(null);
  const destInputRef = useRef<HTMLInputElement | null>(null);
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const dropModeRef = useRef<'origin' | 'dest' | null>(null);
  const originCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const destCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const { routes, routeColors, schedules, loading, schedulesLoading } = useTransit();

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
  const [panelExpanded, setPanelExpanded] = useState(true);

  // Keep refs in sync with state
  useEffect(() => { dropModeRef.current = dropMode; }, [dropMode]);
  useEffect(() => { originCoordsRef.current = originCoords; }, [originCoords]);
  useEffect(() => { destCoordsRef.current = destCoords; }, [destCoords]);

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

  // Reverse geocode coords to get a street address
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

    // Click to drop pin — uses refs to avoid stale closures
    map.addListener('click', async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const coords = { lat, lng };

      const currentDropMode = dropModeRef.current;
      const currentOrigin = originCoordsRef.current;

      if (currentDropMode === 'origin') {
        originCoordsRef.current = coords;
        setOriginCoords(coords);
        setDropMode(null);
        const addr = await reverseGeocode(coords);
        setOriginText(addr);
        toast.success('Origin pin set');
      } else if (currentDropMode === 'dest') {
        destCoordsRef.current = coords;
        setDestCoords(coords);
        setDropMode(null);
        const addr = await reverseGeocode(coords);
        setDestText(addr);
        toast.success('Destination pin set');
      } else if (!currentOrigin) {
        originCoordsRef.current = coords;
        setOriginCoords(coords);
        const addr = await reverseGeocode(coords);
        setOriginText(addr);
        toast.success('Origin set — click again to set destination');
      } else {
        destCoordsRef.current = coords;
        setDestCoords(coords);
        const addr = await reverseGeocode(coords);
        setDestText(addr);
        toast.success('Destination set');
      }
    });

    // Setup Google Places Autocomplete for origin input
    if (originInputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(originInputRef.current, {
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
          setOriginCoords(coords);
          originCoordsRef.current = coords;
          setOriginText(place.formatted_address || place.name || '');
          map.panTo(coords);
        }
      });
      originAutocompleteRef.current = autocomplete;
    }

    // Setup Google Places Autocomplete for destination input
    if (destInputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(destInputRef.current, {
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
          setDestCoords(coords);
          destCoordsRef.current = coords;
          setDestText(place.formatted_address || place.name || '');
        }
      });
      destAutocompleteRef.current = autocomplete;
    }

    setMapReady(true);
  }, [reverseGeocode]);

  // Geocode address (fallback if autocomplete not used)
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
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setLocating(true);
    toast.info('Requesting your location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOriginCoords(coords);
        originCoordsRef.current = coords;
        const addr = await reverseGeocode(coords);
        setOriginText(addr);
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
            msg = 'Location permission denied. Please enable location services in your browser/device settings and try again.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Location information is unavailable. Please try again.';
            break;
          case err.TIMEOUT:
            msg = 'Location request timed out. Please try again.';
            break;
        }
        toast.error(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  }, [reverseGeocode]);

  // ============================================================
  // ROBUST ROUTING ENGINE
  // ============================================================
  const findRoutes = useCallback(async () => {
    let origin = originCoords;
    let dest = destCoords;

    // Geocode if needed
    if (!origin && originText) {
      origin = await geocodeAddress(originText);
      if (origin) {
        setOriginCoords(origin);
        originCoordsRef.current = origin;
      }
    }
    if (!dest && destText) {
      dest = await geocodeAddress(destText);
      if (dest) {
        setDestCoords(dest);
        destCoordsRef.current = dest;
      }
    }

    if (!origin || !dest) {
      toast.error('Please set both origin and destination');
      return;
    }

    setSearching(true);
    setResults([]);
    setSelectedResult(null);

    try {
      const dayType = getDayType();
      const nowMinutes = getCurrentMinutes();
      const directDist = haversine(origin.lat, origin.lng, dest.lat, dest.lng);

      // Find nearby stops for origin and destination (wider radius)
      const nearOriginStops = findNearestStops(origin.lat, origin.lng, allStops, 15, 5);
      const nearDestStops = findNearestStops(dest.lat, dest.lng, allStops, 15, 5);

      const tripResults: TripResult[] = [];
      const seenRouteKeys = new Set<string>(); // Prevent duplicate results

      // ---- STRATEGY 1: Direct routes (same route serves both origin and dest area) ----
      for (const route of routes) {
        // Find the closest stop on this route to origin
        const originMatch = findClosestStopOnRoute(origin.lat, origin.lng, route);
        const destMatch = findClosestStopOnRoute(dest.lat, dest.lng, route);

        if (!originMatch || !destMatch) continue;
        if (originMatch.index === destMatch.index) continue;

        // Allow up to 1.5 miles walk to/from stops (generous for transit)
        if (originMatch.distance > 1.5 || destMatch.distance > 1.5) continue;

        const routeKey = `direct-${route.id}-${originMatch.stop.id}-${destMatch.stop.id}`;
        if (seenRouteKeys.has(routeKey)) continue;
        seenRouteKeys.add(routeKey);

        const color = routeColors.get(route.id) || '#00D4FF';
        const stopsCount = Math.abs(destMatch.index - originMatch.index);

        // Try to find schedule-based timing
        const routeSched = schedules[route.id];
        let bestTrip: { dep: string; arr: string; depMin: number; arrMin: number } | null = null;

        if (routeSched) {
          const trips = routeSched[dayType] || [];
          for (const trip of trips) {
            const originStopTime = trip.stops.find(s => s.stop_id === originMatch.stop.id);
            const destStopTime = trip.stops.find(s => s.stop_id === destMatch.stop.id);

            if (originStopTime && destStopTime) {
              const depMin = parseGtfsTime(originStopTime.departure).totalMinutes;
              const arrMin = parseGtfsTime(destStopTime.arrival).totalMinutes;

              // Bus must depart after now (with walk time buffer) and arrive after departure
              const walkToStopMin = estimateWalkTime(originMatch.distance);
              if (depMin >= (nowMinutes + walkToStopMin - 5) && arrMin > depMin) {
                if (!bestTrip || depMin < bestTrip.depMin) {
                  bestTrip = {
                    dep: originStopTime.departure,
                    arr: destStopTime.arrival,
                    depMin,
                    arrMin,
                  };
                }
              }
            }
          }
        }

        // Build segments
        const segments: TripSegment[] = [];
        const walkToStopDist = originMatch.distance;
        const walkFromStopDist = destMatch.distance;

        if (walkToStopDist > 0.03) {
          segments.push({
            type: 'walk',
            fromName: 'Your Location',
            toName: originMatch.stop.name,
            distance: walkToStopDist,
            duration: estimateWalkTime(walkToStopDist),
          });
        }

        const busDuration = bestTrip
          ? (bestTrip.arrMin - bestTrip.depMin)
          : Math.round(stopsCount * 2.5); // Estimate ~2.5 min per stop if no schedule

        segments.push({
          type: 'bus',
          route,
          fromStop: originMatch.stop,
          toStop: destMatch.stop,
          fromName: originMatch.stop.name,
          toName: destMatch.stop.name,
          distance: haversine(originMatch.stop.lat, originMatch.stop.lon, destMatch.stop.lat, destMatch.stop.lon),
          duration: busDuration,
          departureTime: bestTrip?.dep || '',
          arrivalTime: bestTrip?.arr || '',
          stopsCount,
          color,
        });

        if (walkFromStopDist > 0.03) {
          segments.push({
            type: 'walk',
            fromName: destMatch.stop.name,
            toName: 'Destination',
            distance: walkFromStopDist,
            duration: estimateWalkTime(walkFromStopDist),
          });
        }

        const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
        const totalDist = walkToStopDist + haversine(originMatch.stop.lat, originMatch.stop.lon, destMatch.stop.lat, destMatch.stop.lon) + walkFromStopDist;

        tripResults.push({
          segments,
          totalDistance: totalDist,
          totalDuration,
          departureTime: bestTrip?.dep || '',
          arrivalTime: bestTrip?.arr || '',
          label: `Route ${route.short_name}`,
        });
      }

      // ---- STRATEGY 2: Transfer routes (two buses with a transfer point) ----
      if (tripResults.length < 3) {
        // For each stop near origin, find routes serving it
        for (const nearOrig of nearOriginStops.slice(0, 8)) {
          const origRoutes = findRoutesForStop(nearOrig.stop.id, routes);

          for (const origRoute of origRoutes) {
            // For each stop on origRoute, check if any route from there reaches near dest
            const origStopIdx = origRoute.stops.findIndex(s => s.id === nearOrig.stop.id);
            if (origStopIdx < 0) continue;

            // Check transfer points (every 3rd stop to limit computation)
            for (let ti = 0; ti < origRoute.stops.length; ti += 1) {
              if (ti === origStopIdx) continue;
              const transferStop = origRoute.stops[ti];

              // Find routes at this transfer stop
              const transferRoutes = findRoutesForStop(transferStop.id, routes);

              for (const destRoute of transferRoutes) {
                if (destRoute.id === origRoute.id) continue;

                const destMatch = findClosestStopOnRoute(dest.lat, dest.lng, destRoute);
                if (!destMatch || destMatch.distance > 1.5) continue;

                const routeKey = `transfer-${origRoute.id}-${destRoute.id}-${transferStop.id}`;
                if (seenRouteKeys.has(routeKey)) continue;
                seenRouteKeys.add(routeKey);

                const color1 = routeColors.get(origRoute.id) || '#00D4FF';
                const color2 = routeColors.get(destRoute.id) || '#FFB020';
                const stopsCount1 = Math.abs(ti - origStopIdx);
                const transferStopIdx = destRoute.stops.findIndex(s => s.id === transferStop.id);
                const stopsCount2 = transferStopIdx >= 0 ? Math.abs(destMatch.index - transferStopIdx) : 5;

                const segments: TripSegment[] = [];

                if (nearOrig.distance > 0.03) {
                  segments.push({
                    type: 'walk',
                    fromName: 'Your Location',
                    toName: nearOrig.stop.name,
                    distance: nearOrig.distance,
                    duration: estimateWalkTime(nearOrig.distance),
                  });
                }

                segments.push({
                  type: 'bus',
                  route: origRoute,
                  fromStop: nearOrig.stop,
                  toStop: transferStop,
                  fromName: nearOrig.stop.name,
                  toName: transferStop.name,
                  distance: haversine(nearOrig.stop.lat, nearOrig.stop.lon, transferStop.lat, transferStop.lon),
                  duration: Math.round(stopsCount1 * 2.5),
                  stopsCount: stopsCount1,
                  color: color1,
                });

                // Transfer walk (usually same stop, so minimal)
                segments.push({
                  type: 'walk',
                  fromName: `Transfer at ${transferStop.name}`,
                  toName: transferStop.name,
                  distance: 0,
                  duration: 5, // 5 min transfer time
                });

                segments.push({
                  type: 'bus',
                  route: destRoute,
                  fromStop: transferStop,
                  toStop: destMatch.stop,
                  fromName: transferStop.name,
                  toName: destMatch.stop.name,
                  distance: haversine(transferStop.lat, transferStop.lon, destMatch.stop.lat, destMatch.stop.lon),
                  duration: Math.round(stopsCount2 * 2.5),
                  stopsCount: stopsCount2,
                  color: color2,
                });

                if (destMatch.distance > 0.03) {
                  segments.push({
                    type: 'walk',
                    fromName: destMatch.stop.name,
                    toName: 'Destination',
                    distance: destMatch.distance,
                    duration: estimateWalkTime(destMatch.distance),
                  });
                }

                const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
                const totalDist = segments.reduce((sum, s) => sum + s.distance, 0);

                tripResults.push({
                  segments,
                  totalDistance: totalDist,
                  totalDuration,
                  departureTime: '',
                  arrivalTime: '',
                  label: `${origRoute.short_name} → ${destRoute.short_name}`,
                });
              }
            }
          }
        }
      }

      // ---- STRATEGY 3: Walking option ----
      if (isWalkable(directDist)) {
        tripResults.push({
          segments: [{
            type: 'walk',
            fromName: 'Your Location',
            toName: 'Destination',
            distance: directDist,
            duration: estimateWalkTime(directDist),
          }],
          totalDistance: directDist,
          totalDuration: estimateWalkTime(directDist),
          departureTime: '',
          arrivalTime: '',
          walkOnly: true,
          label: 'Walk',
        });
      }

      // ---- STRATEGY 4: Biking option ----
      if (isBikeable(directDist)) {
        tripResults.push({
          segments: [{
            type: 'bike',
            fromName: 'Your Location',
            toName: 'Destination',
            distance: directDist,
            duration: estimateBikeTime(directDist),
          }],
          totalDistance: directDist,
          totalDuration: estimateBikeTime(directDist),
          departureTime: '',
          arrivalTime: '',
          bikeOnly: true,
          label: 'Bike',
        });
      }

      // Sort by total duration, deduplicate very similar results
      tripResults.sort((a, b) => a.totalDuration - b.totalDuration);

      // Remove near-duplicate results (same route combo within 5 min)
      const filtered: TripResult[] = [];
      for (const r of tripResults) {
        const isDupe = filtered.some(f =>
          f.label === r.label && Math.abs(f.totalDuration - r.totalDuration) < 5
        );
        if (!isDupe) {
          filtered.push(r);
        }
      }

      setResults(filtered.slice(0, 8));

      if (filtered.length === 0) {
        if (directDist > 5) {
          toast.info(`No transit routes found for this ${formatDistance(directDist)} trip. The distance may be too far for current bus coverage.`);
        } else {
          toast.info('No transit routes found. Try adjusting your origin or destination.');
        }
      } else {
        toast.success(`Found ${filtered.length} route option${filtered.length > 1 ? 's' : ''}!`);
      }
    } catch (err) {
      toast.error('Error finding routes. Please try again.');
      console.error('Routing error:', err);
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
      el.innerHTML = `<div style="width:22px;height:22px;border-radius:50%;background:#00FF88;border:3px solid #0D1117;box-shadow:0 0 14px #00FF8880;"></div>`;
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
      el.innerHTML = `<div style="width:22px;height:22px;border-radius:50%;background:#FF4444;border:3px solid #0D1117;box-shadow:0 0 14px #FF444480;"></div>`;
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

          // Draw the route shape
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

          // Show boarding and alighting stop markers
          if (seg.fromStop) {
            const fromEl = document.createElement('div');
            fromEl.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #0D1117;box-shadow:0 0 8px ${color}80;"></div>`;
            const fromMarker = new google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat: seg.fromStop.lat, lng: seg.fromStop.lon },
              content: fromEl.firstElementChild as HTMLElement,
              title: `Board: ${seg.fromStop.name}`,
            });
            markersRef.current.push(fromMarker);
          }
          if (seg.toStop) {
            const toEl = document.createElement('div');
            toEl.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #0D1117;box-shadow:0 0 8px ${color}80;"></div>`;
            const toMarker = new google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat: seg.toStop.lat, lng: seg.toStop.lon },
              content: toEl.firstElementChild as HTMLElement,
              title: `Alight: ${seg.toStop.name}`,
            });
            markersRef.current.push(toMarker);
          }
        } else if (seg.type === 'walk' && seg.distance > 0.03) {
          // Draw dashed walking line between points
          // We approximate with a straight line
          const walkPoints: google.maps.LatLngLiteral[] = [];
          if (seg.fromStop) walkPoints.push({ lat: seg.fromStop.lat, lng: seg.fromStop.lon });
          if (seg.toStop) walkPoints.push({ lat: seg.toStop.lat, lng: seg.toStop.lon });

          // For first/last walk segments, use origin/dest coords
          if (seg.fromName === 'Your Location' && originCoords) {
            walkPoints.unshift(originCoords);
            if (seg.toStop) walkPoints.push({ lat: seg.toStop.lat, lng: seg.toStop.lon });
            else if (result.segments[1]?.fromStop) walkPoints.push({ lat: result.segments[1].fromStop.lat, lng: result.segments[1].fromStop.lon });
          }
          if (seg.toName === 'Destination' && destCoords) {
            if (seg.fromStop) walkPoints.unshift({ lat: seg.fromStop.lat, lng: seg.fromStop.lon });
            else {
              const prevSeg = result.segments[result.segments.indexOf(seg) - 1];
              if (prevSeg?.toStop) walkPoints.unshift({ lat: prevSeg.toStop.lat, lng: prevSeg.toStop.lon });
            }
            walkPoints.push(destCoords);
          }

          if (walkPoints.length >= 2) {
            const walkLine = new google.maps.Polyline({
              path: walkPoints,
              geodesic: true,
              strokeColor: '#00FF88',
              strokeOpacity: 0,
              strokeWeight: 3,
              map: mapRef.current,
              zIndex: 8,
              icons: [{
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.7,
                  strokeColor: '#00FF88',
                  scale: 3,
                },
                offset: '0',
                repeat: '12px',
              }],
            });
            polylinesRef.current.push(walkLine);
          }
        }
      });

      const isMobile = window.innerWidth < 768;
      mapRef.current.fitBounds(bounds, isMobile
        ? { top: 80, bottom: 280, left: 20, right: 20 }
        : { top: 80, bottom: 20, left: 20, right: 420 }
      );
    } else if (originCoords && destCoords) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(originCoords);
      bounds.extend(destCoords);
      const isMobile = window.innerWidth < 768;
      mapRef.current.fitBounds(bounds, isMobile
        ? { top: 80, bottom: 200, left: 20, right: 20 }
        : { top: 80, bottom: 20, left: 20, right: 420 }
      );
    }
  }, [mapReady, originCoords, destCoords, results, selectedResult]);

  const currentDayType = getDayType();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-background relative flex flex-col">
      <NavHeader />

      {/* Map — fills available space */}
      <div className="flex-1 relative mt-14">
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
              <Crosshair className={`w-4 h-4 ${dropMode === 'origin' ? 'text-[#00FF88]' : 'text-[#FF4444]'}`} />
              <span className="font-mono text-xs text-foreground">
                Tap map to set {dropMode === 'origin' ? 'origin' : 'destination'}
              </span>
              <button
                onClick={() => setDropMode(null)}
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
            <Loader2 className="w-3 h-3 animate-spin text-[#00D4FF]" />
            <span className="font-mono text-[10px] text-muted-foreground">Loading schedules...</span>
          </div>
        )}
      </div>

      {/* Trip planner panel — bottom sheet on mobile, side panel on desktop */}
      <div className={`
        md:absolute md:top-16 md:right-3 md:bottom-3 md:w-96 md:rounded-lg
        w-full z-30 glass-panel overflow-hidden flex flex-col
        ${panelExpanded ? 'max-h-[65dvh] md:max-h-none' : 'max-h-[140px] md:max-h-none'}
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
              <RouteIcon className="w-4 h-4 text-[#00D4FF]" />
              <span className="font-mono text-xs font-bold tracking-wider text-[#00D4FF] uppercase">
                Plan Your Trip
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{dayStr} &middot; {timeStr}</span>
              <span className="px-1 py-0.5 rounded bg-white/5 text-[8px] uppercase">
                {currentDayType}
              </span>
            </div>
          </div>

          {/* Origin */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#00FF88] shrink-0" />
              <div className="flex-1 relative">
                <input
                  ref={originInputRef}
                  type="text"
                  placeholder="Starting location or address..."
                  value={originText}
                  onChange={e => { setOriginText(e.target.value); setOriginCoords(null); }}
                  className="w-full h-9 px-3 pr-8 text-xs bg-background/50 border border-border/50 rounded-md font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#00D4FF]/50"
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
                onClick={() => { setDropMode(dropMode === 'origin' ? null : 'origin'); if (dropMode !== 'origin') toast.info('Tap the map to set your starting point'); }}
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
                <input
                  ref={destInputRef}
                  type="text"
                  placeholder="Destination address..."
                  value={destText}
                  onChange={e => { setDestText(e.target.value); setDestCoords(null); }}
                  className="w-full h-9 px-3 pr-8 text-xs bg-background/50 border border-border/50 rounded-md font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#FF4444]/50"
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
                onClick={() => { setDropMode(dropMode === 'dest' ? null : 'dest'); if (dropMode !== 'dest') toast.info('Tap the map to set your destination'); }}
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
            disabled={searching || loading || (!originText && !originCoords) || (!destText && !destCoords)}
            className="w-full mt-2 h-10 font-mono text-xs tracking-wider uppercase bg-[#00D4FF] hover:bg-[#00B4E6] text-[#0D1117] font-bold"
          >
            {searching ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" /> Find Routes</>
            )}
          </Button>
        </div>

        {/* Results — scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-3">
            <AnimatePresence>
              {results.map((result, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
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
                      {result.walkOnly ? (
                        <Footprints className="w-4 h-4 text-[#00FF88]" />
                      ) : result.bikeOnly ? (
                        <Bike className="w-4 h-4 text-[#FFD700]" />
                      ) : (
                        <Bus className="w-4 h-4 text-[#00D4FF]" />
                      )}
                      <span className="font-mono text-sm font-bold text-foreground">
                        {formatDuration(result.totalDuration)}
                      </span>
                      {result.label && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                          {result.label}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDistance(result.totalDistance)}
                    </span>
                  </div>

                  {/* Time info */}
                  {result.departureTime && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-mono text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Departs {formatTime(result.departureTime)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>Arrives {formatTime(result.arrivalTime)}</span>
                    </div>
                  )}

                  {/* Segment pills */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {result.segments.filter(s => !(s.type === 'walk' && s.distance === 0 && s.duration <= 5 && s.fromName.startsWith('Transfer'))).map((seg, j) => (
                      <div key={j} className="flex items-center gap-1">
                        {j > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                        {seg.type === 'walk' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#00FF88]/10 text-[10px] font-mono text-[#00FF88]">
                            <Footprints className="w-3 h-3" />
                            {seg.duration}m &middot; {formatDistance(seg.distance)}
                          </div>
                        ) : seg.type === 'bike' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFD700]/10 text-[10px] font-mono text-[#FFD700]">
                            <Bike className="w-3 h-3" />
                            {seg.duration}m &middot; {formatDistance(seg.distance)}
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
                            {seg.stopsCount !== undefined && <span className="opacity-70">({seg.stopsCount} stops)</span>}
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
                              ) : seg.type === 'bike' ? (
                                <Bike className="w-3.5 h-3.5 text-[#FFD700]" />
                              ) : (
                                <Bus className="w-3.5 h-3.5" style={{ color: seg.color }} />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-foreground">
                                {seg.type === 'walk'
                                  ? seg.distance > 0
                                    ? `Walk ${formatDistance(seg.distance)} (${seg.duration} min)`
                                    : `Transfer wait (~${seg.duration} min)`
                                  : seg.type === 'bike'
                                    ? `Bike ${formatDistance(seg.distance)} (${seg.duration} min)`
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
                              {seg.type === 'bus' && !seg.departureTime && (
                                <div className="text-[10px] font-mono mt-0.5 text-muted-foreground/60">
                                  Estimated ~{seg.duration} min ride
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Practicality note */}
                        {result.walkOnly && (
                          <div className="mt-2 p-2 rounded bg-[#00FF88]/5 border border-[#00FF88]/20 text-[10px] font-mono text-[#00FF88]">
                            This distance is walkable — {formatDistance(result.totalDistance)} in about {formatDuration(result.totalDuration)}.
                          </div>
                        )}
                        {result.bikeOnly && (
                          <div className="mt-2 p-2 rounded bg-[#FFD700]/5 border border-[#FFD700]/20 text-[10px] font-mono text-[#FFD700]">
                            Bikeable — {formatDistance(result.totalDistance)} in about {formatDuration(result.totalDuration)}.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </AnimatePresence>

            {results.length === 0 && !searching && (
              <div className="text-center py-8 md:py-12">
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
        </div>
      </div>
    </div>
  );
}
