/*
 * TripPlanner — Point A to Point B transit routing
 * Design: Transit Control Room — clean map with floating input panels
 * Features: Geolocation, Google Places Autocomplete, pin drop, optimal route calculation
 * Routing: Schedule-aware, multi-strategy (direct, transfer, walk/bike), holiday-aware
 * Visualization: Sliced bus paths, Google walking directions, animated markers
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
  sliceRouteShape,
} from '@/lib/transitData';
import type { TransitRoute, TransitStop, RouteSchedule, TripSchedule } from '@/lib/transitData';
import { Button } from '@/components/ui/button';
import {
  MapPin, Navigation, Crosshair, Search, ArrowRight, Clock,
  Footprints, Bus, LocateFixed, Loader2, Route as RouteIcon, X,
  GripHorizontal, Bike, AlertTriangle, Calendar, Eye, RotateCcw,
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
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
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

  // Get walking directions from Google
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
      const seenRouteKeys = new Set<string>();

      // ---- STRATEGY 1: Direct routes ----
      for (const route of routes) {
        const originMatch = findClosestStopOnRoute(origin.lat, origin.lng, route);
        const destMatch = findClosestStopOnRoute(dest.lat, dest.lng, route);

        if (!originMatch || !destMatch) continue;
        if (originMatch.index === destMatch.index) continue;
        if (originMatch.distance > 1.5 || destMatch.distance > 1.5) continue;

        const routeKey = `direct-${route.id}-${originMatch.stop.id}-${destMatch.stop.id}`;
        if (seenRouteKeys.has(routeKey)) continue;
        seenRouteKeys.add(routeKey);

        const color = routeColors.get(route.id) || '#00D4FF';
        const stopsCount = Math.abs(destMatch.index - originMatch.index);

        // Get stops between boarding and alighting
        const startIdx = Math.min(originMatch.index, destMatch.index);
        const endIdx = Math.max(originMatch.index, destMatch.index);
        const stopsBetween = route.stops.slice(startIdx, endIdx + 1);

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
          : Math.round(stopsCount * 2.5);

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
          stopsBetween,
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

      // ---- STRATEGY 2: Transfer routes ----
      if (tripResults.length < 3) {
        for (const nearOrig of nearOriginStops.slice(0, 8)) {
          const origRoutes = findRoutesForStop(nearOrig.stop.id, routes);

          for (const origRoute of origRoutes) {
            const origStopIdx = origRoute.stops.findIndex(s => s.id === nearOrig.stop.id);
            if (origStopIdx < 0) continue;

            for (let ti = 0; ti < origRoute.stops.length; ti += 1) {
              if (ti === origStopIdx) continue;
              const transferStop = origRoute.stops[ti];

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

                // Get stops between for each leg
                const leg1Start = Math.min(origStopIdx, ti);
                const leg1End = Math.max(origStopIdx, ti);
                const stopsBetween1 = origRoute.stops.slice(leg1Start, leg1End + 1);

                const leg2Start = Math.min(transferStopIdx >= 0 ? transferStopIdx : 0, destMatch.index);
                const leg2End = Math.max(transferStopIdx >= 0 ? transferStopIdx : 0, destMatch.index);
                const stopsBetween2 = destRoute.stops.slice(leg2Start, leg2End + 1);

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
                  stopsBetween: stopsBetween1,
                });

                // Transfer walk
                segments.push({
                  type: 'walk',
                  fromName: `Transfer at ${transferStop.name}`,
                  toName: transferStop.name,
                  distance: 0,
                  duration: 5,
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
                  stopsBetween: stopsBetween2,
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
        // Auto-select the first result to show visualization
        setSelectedResult(0);
      }
    } catch (err) {
      toast.error('Error finding routes. Please try again.');
      console.error('Routing error:', err);
    } finally {
      setSearching(false);
    }
  }, [originCoords, destCoords, originText, destText, routes, routeColors, schedules, allStops, geocodeAddress]);

  // ============================================================
  // MAP VISUALIZATION — draw route on map when result is selected
  // ============================================================
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // Clear all existing overlays
    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();

    const map = mapRef.current;
    const bounds = new google.maps.LatLngBounds();

    // ---- Always show origin/dest markers ----
    if (originCoords) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:#0D1117;border:2px solid #00FF88;border-radius:6px;padding:2px 8px;margin-bottom:4px;white-space:nowrap;">
            <span style="color:#00FF88;font-family:monospace;font-size:10px;font-weight:bold;">START</span>
          </div>
          <div style="width:20px;height:20px;border-radius:50%;background:#00FF88;border:3px solid #0D1117;box-shadow:0 0 14px #00FF8880;"></div>
        </div>
      `;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: originCoords,
        content: el.firstElementChild as HTMLElement,
        title: 'Origin',
        zIndex: 100,
      });
      markersRef.current.push(marker);
      bounds.extend(originCoords);
    }

    if (destCoords) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:#0D1117;border:2px solid #FF4444;border-radius:6px;padding:2px 8px;margin-bottom:4px;white-space:nowrap;">
            <span style="color:#FF4444;font-family:monospace;font-size:10px;font-weight:bold;">END</span>
          </div>
          <div style="width:20px;height:20px;border-radius:50%;background:#FF4444;border:3px solid #0D1117;box-shadow:0 0 14px #FF444480;"></div>
        </div>
      `;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: destCoords,
        content: el.firstElementChild as HTMLElement,
        title: 'Destination',
        zIndex: 100,
      });
      markersRef.current.push(marker);
      bounds.extend(destCoords);
    }

    // ---- Draw selected route visualization ----
    if (selectedResult !== null && results[selectedResult]) {
      const result = results[selectedResult];

      // Process each segment
      const drawSegments = async () => {
        for (let segIdx = 0; segIdx < result.segments.length; segIdx++) {
          const seg = result.segments[segIdx];

          if (seg.type === 'bus' && seg.route && seg.fromStop && seg.toStop) {
            const color = seg.color || '#00D4FF';

            // Slice the route shape to only show the relevant portion
            const slicedShape = sliceRouteShape(seg.route, seg.fromStop, seg.toStop);
            const path = slicedShape.map(([lat, lng]) => ({ lat, lng }));

            if (path.length >= 2) {
              // Glow effect (wider, semi-transparent)
              const glow = new google.maps.Polyline({
                path,
                geodesic: true,
                strokeColor: color,
                strokeOpacity: 0.25,
                strokeWeight: 14,
                map,
                zIndex: 8,
              });
              polylinesRef.current.push(glow);

              // Main route line
              const line = new google.maps.Polyline({
                path,
                geodesic: true,
                strokeColor: color,
                strokeOpacity: 1,
                strokeWeight: 5,
                map,
                zIndex: 10,
              });
              polylinesRef.current.push(line);

              // Extend bounds with sliced path
              path.forEach(p => bounds.extend(p));
            }

            // Draw intermediate stops along this bus segment
            if (seg.stopsBetween && seg.stopsBetween.length > 0) {
              seg.stopsBetween.forEach((stop, i) => {
                const isBoarding = stop.id === seg.fromStop!.id;
                const isAlighting = stop.id === seg.toStop!.id;
                const size = (isBoarding || isAlighting) ? 14 : 8;
                const borderW = (isBoarding || isAlighting) ? 3 : 2;

                const el = document.createElement('div');
                if (isBoarding || isAlighting) {
                  const label = isBoarding ? 'BOARD' : 'EXIT';
                  const icon = isBoarding ? '🚌' : '🚏';
                  el.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                      <div style="background:#0D1117;border:2px solid ${color};border-radius:6px;padding:2px 6px;margin-bottom:3px;white-space:nowrap;display:flex;align-items:center;gap:3px;">
                        <span style="font-size:10px;">${icon}</span>
                        <span style="color:${color};font-family:monospace;font-size:9px;font-weight:bold;">${label}</span>
                      </div>
                      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${borderW}px solid #0D1117;box-shadow:0 0 10px ${color}80;"></div>
                    </div>
                  `;
                } else {
                  el.innerHTML = `
                    <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${borderW}px solid #0D1117;opacity:0.7;cursor:pointer;"></div>
                  `;
                }

                const marker = new google.maps.marker.AdvancedMarkerElement({
                  map,
                  position: { lat: stop.lat, lng: stop.lon },
                  content: el.firstElementChild as HTMLElement,
                  title: stop.name,
                  zIndex: (isBoarding || isAlighting) ? 50 : 20,
                });

                // Click handler for stop info
                marker.addListener('click', () => {
                  if (infoWindowRef.current) {
                    const stopNum = i + 1;
                    const totalStops = seg.stopsBetween!.length;
                    let statusLabel = '';
                    if (isBoarding) statusLabel = '<span style="color:#00FF88;font-weight:bold;">BOARDING STOP</span>';
                    else if (isAlighting) statusLabel = '<span style="color:#FF4444;font-weight:bold;">EXIT STOP</span>';
                    else statusLabel = `<span style="color:${color};">Stop ${stopNum} of ${totalStops}</span>`;

                    infoWindowRef.current.setContent(`
                      <div style="background:#0D1117;color:#E0E0E0;padding:10px 14px;border-radius:8px;font-family:'JetBrains Mono',monospace;min-width:180px;border:1px solid ${color}40;">
                        <div style="font-size:12px;font-weight:bold;color:${color};margin-bottom:4px;">${stop.name}</div>
                        <div style="font-size:10px;color:#888;margin-bottom:6px;">${statusLabel}</div>
                        <div style="font-size:10px;color:#666;">
                          Route ${seg.route!.short_name} — ${seg.route!.county} County<br/>
                          ${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}
                        </div>
                      </div>
                    `);
                    infoWindowRef.current.open(map, marker);
                  }
                });

                markersRef.current.push(marker);
              });
            }

          } else if (seg.type === 'walk' && seg.distance > 0.03) {
            // Determine walk endpoints
            let walkFrom: { lat: number; lng: number } | null = null;
            let walkTo: { lat: number; lng: number } | null = null;

            if (seg.fromName === 'Your Location' && originCoords) {
              walkFrom = originCoords;
              // Find the next bus segment's fromStop
              const nextSeg = result.segments[segIdx + 1];
              if (nextSeg?.fromStop) {
                walkTo = { lat: nextSeg.fromStop.lat, lng: nextSeg.fromStop.lon };
              }
            } else if (seg.toName === 'Destination' && destCoords) {
              walkTo = destCoords;
              // Find the previous bus segment's toStop
              const prevSeg = result.segments[segIdx - 1];
              if (prevSeg?.toStop) {
                walkFrom = { lat: prevSeg.toStop.lat, lng: prevSeg.toStop.lon };
              }
            } else if (seg.fromStop && seg.toStop) {
              walkFrom = { lat: seg.fromStop.lat, lng: seg.fromStop.lon };
              walkTo = { lat: seg.toStop.lat, lng: seg.toStop.lon };
            }

            if (walkFrom && walkTo) {
              // Try Google walking directions for realistic path
              const walkPath = await getWalkingPath(walkFrom, walkTo);

              if (walkPath && walkPath.length >= 2) {
                // Use Google's walking path
                const walkLine = new google.maps.Polyline({
                  path: walkPath,
                  geodesic: true,
                  strokeColor: '#00FF88',
                  strokeOpacity: 0,
                  strokeWeight: 4,
                  map,
                  zIndex: 7,
                  icons: [{
                    icon: {
                      path: 'M 0,-1 0,1',
                      strokeOpacity: 0.8,
                      strokeColor: '#00FF88',
                      scale: 3,
                    },
                    offset: '0',
                    repeat: '10px',
                  }],
                });
                polylinesRef.current.push(walkLine);
                walkPath.forEach(p => bounds.extend(p));
              } else {
                // Fallback: straight dashed line
                const walkLine = new google.maps.Polyline({
                  path: [walkFrom, walkTo],
                  geodesic: true,
                  strokeColor: '#00FF88',
                  strokeOpacity: 0,
                  strokeWeight: 4,
                  map,
                  zIndex: 7,
                  icons: [{
                    icon: {
                      path: 'M 0,-1 0,1',
                      strokeOpacity: 0.8,
                      strokeColor: '#00FF88',
                      scale: 3,
                    },
                    offset: '0',
                    repeat: '10px',
                  }],
                });
                polylinesRef.current.push(walkLine);
              }

              bounds.extend(walkFrom);
              bounds.extend(walkTo);
            }

          } else if (seg.type === 'bike' && seg.distance > 0.03) {
            // Bike segment — use origin/dest
            if (originCoords && destCoords) {
              const bikeLine = new google.maps.Polyline({
                path: [originCoords, destCoords],
                geodesic: true,
                strokeColor: '#FFD700',
                strokeOpacity: 0,
                strokeWeight: 4,
                map,
                zIndex: 7,
                icons: [{
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.8,
                    strokeColor: '#FFD700',
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '14px',
                }],
              });
              polylinesRef.current.push(bikeLine);
            }
          }
        }

        // Fit bounds with padding
        if (!bounds.isEmpty()) {
          const isMobile = window.innerWidth < 768;
          map.fitBounds(bounds, isMobile
            ? { top: 80, bottom: 280, left: 20, right: 20 }
            : { top: 80, bottom: 40, left: 40, right: 420 }
          );
        }
      };

      drawSegments();

    } else if (originCoords && destCoords) {
      // No result selected — just show origin/dest
      const isMobile = window.innerWidth < 768;
      map.fitBounds(bounds, isMobile
        ? { top: 80, bottom: 200, left: 20, right: 20 }
        : { top: 80, bottom: 20, left: 20, right: 420 }
      );
    }
  }, [mapReady, originCoords, destCoords, results, selectedResult, getWalkingPath]);

  const currentDayType = getDayType();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-background relative flex flex-col">
      <NavHeader />

      {/* Map — fills available space, fully interactive */}
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
              <Crosshair className={`w-4 h-4`} style={{ color: dropMode === 'origin' ? '#788c5d' : '#d97757' }} />
              <span className="text-xs text-foreground" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
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

        {/* Route visualization legend — shown when a result is selected */}
        <AnimatePresence>
          {selectedResult !== null && results[selectedResult] && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute bottom-4 left-3 z-30 glass-panel rounded-lg p-3 max-w-[200px]"
            >
              <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Legend</div>
              <div className="space-y-1.5">
                {results[selectedResult].segments
                  .filter(s => s.type === 'bus')
                  .map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-4 h-1 rounded-full" style={{ backgroundColor: seg.color }} />
                      <span className="font-mono text-[10px] text-foreground">
                        Route {seg.route?.short_name}
                      </span>
                    </div>
                  ))
                }
                {results[selectedResult].segments.some(s => s.type === 'walk' && s.distance > 0.03) && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0 border-t-2 border-dashed border-[#00FF88]" />
                    <span className="font-mono text-[10px] text-[#00FF88]">Walking</span>
                  </div>
                )}
                {results[selectedResult].segments.some(s => s.type === 'bike') && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0 border-t-2 border-dashed border-[#FFD700]" />
                    <span className="font-mono text-[10px] text-[#FFD700]">Biking</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                  <div className="w-3 h-3 rounded-full bg-[#00FF88] border-2 border-[#0D1117]" />
                  <span className="font-mono text-[10px] text-muted-foreground">Start</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF4444] border-2 border-[#0D1117]" />
                  <span className="font-mono text-[10px] text-muted-foreground">End</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
              <RouteIcon className="w-4 h-4" style={{ color: '#d97757' }} />
              <span className="text-xs font-medium tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#d97757' }}>
                Plan Your Trip
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: '#788c5d' }} />
              <div className="flex-1 relative">
                <input
                  ref={originInputRef}
                  type="text"
                  placeholder="Starting location or address..."
                  value={originText}
                  onChange={e => { setOriginText(e.target.value); setOriginCoords(null); }}
                  className="w-full h-9 px-3 pr-8 text-xs bg-background/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#d97757]/40"
                  style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
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
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors disabled:opacity-50"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", background: 'rgba(120,140,93,0.1)', color: '#788c5d', border: '1px solid rgba(120,140,93,0.2)' }}
              >
                {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
                My Location
              </button>
              <button
                onClick={() => { setDropMode(dropMode === 'origin' ? null : 'origin'); if (dropMode !== 'origin') toast.info('Tap the map to set your starting point'); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors"
                style={{
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  ...(dropMode === 'origin'
                    ? { background: 'rgba(106,155,204,0.15)', color: '#6a9bcc', border: '1px solid rgba(106,155,204,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#b0aea5', border: '1px solid rgba(255,255,255,0.08)' })
                }}
              >
                <Crosshair className="w-3 h-3" />
                Drop Pin
              </button>
            </div>

            {/* Destination */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: '#d97757' }} />
              <div className="flex-1 relative">
                <input
                  ref={destInputRef}
                  type="text"
                  placeholder="Destination address..."
                  value={destText}
                  onChange={e => { setDestText(e.target.value); setDestCoords(null); }}
                  className="w-full h-9 px-3 pr-8 text-xs bg-background/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#d97757]/40"
                  style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
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
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors"
                style={{
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  ...(dropMode === 'dest'
                    ? { background: 'rgba(217,119,87,0.15)', color: '#d97757', border: '1px solid rgba(217,119,87,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#b0aea5', border: '1px solid rgba(255,255,255,0.08)' })
                }}
              >
                <Crosshair className="w-3 h-3" />
                Drop Pin
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-2">
            <Button
              onClick={findRoutes}
              disabled={searching || loading || (!originText && !originCoords) || (!destText && !destCoords)}
              className="flex-1 h-10 text-sm tracking-tight font-medium rounded-lg"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", background: '#d97757', color: '#141413' }}
            >
              {searching ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Find Routes</>
              )}
            </Button>
            {(originText || destText || results.length > 0) && (
              <Button
                onClick={() => {
                  setOriginText(''); setOriginCoords(null);
                  setDestText(''); setDestCoords(null);
                  setResults([]); setSelectedResult(null);
                  setDropMode(null);
                  if (originInputRef.current) originInputRef.current.value = '';
                  if (destInputRef.current) destInputRef.current.value = '';
                  // Clear map markers and polylines
                  markersRef.current.forEach(m => (m.map = null));
                  markersRef.current = [];
                  polylinesRef.current.forEach(p => p.setMap(null));
                  polylinesRef.current = [];
                  if (infoWindowRef.current) infoWindowRef.current.close();
                  // Reset map view
                  if (mapRef.current) {
                    mapRef.current.panTo(LI_CENTER);
                    mapRef.current.setZoom(10);
                  }
                }}
                variant="outline"
                className="h-10 px-3 rounded-lg border-border/50 hover:bg-white/5"
                title="Clear all & reset"
              >
                <RotateCcw className="w-4 h-4" style={{ color: '#b0aea5' }} />
              </Button>
            )}
          </div>
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
                      ? 'bg-white/10 border-[#d97757]/30 ring-1 ring-[#d97757]/15'
                      : 'bg-white/4 border-transparent hover:bg-white/6 hover:border-border/30'
                    }
                  `}
                >
                  {/* Summary */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {result.walkOnly ? (
                        <Footprints className="w-4 h-4" style={{ color: '#788c5d' }} />
                      ) : result.bikeOnly ? (
                        <Bike className="w-4 h-4" style={{ color: '#d97757' }} />
                      ) : (
                        <Bus className="w-4 h-4" style={{ color: '#6a9bcc' }} />
                      )}
                      <span className="text-sm font-medium text-foreground" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                        {formatDuration(result.totalDuration)}
                      </span>
                      {result.label && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                          {result.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedResult === i && (
                        <Eye className="w-3 h-3" style={{ color: '#d97757' }} />
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDistance(result.totalDistance)}
                      </span>
                    </div>
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
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(120,140,93,0.1)', color: '#788c5d' }}>
                            <Footprints className="w-3 h-3" />
                            {seg.duration}m &middot; {formatDistance(seg.distance)}
                          </div>
                        ) : seg.type === 'bike' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(217,119,87,0.1)', color: '#d97757' }}>
                            <Bike className="w-3 h-3" />
                            {seg.duration}m &middot; {formatDistance(seg.distance)}
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                            
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
                            <div className="mt-0.5 flex flex-col items-center">
                              {seg.type === 'walk' ? (
                                <Footprints className="w-3.5 h-3.5" style={{ color: '#788c5d' }} />
                              ) : seg.type === 'bike' ? (
                                <Bike className="w-3.5 h-3.5" style={{ color: '#d97757' }} />
                              ) : (
                                <Bus className="w-3.5 h-3.5" style={{ color: seg.color }} />
                              )}
                              {j < result.segments.length - 1 && (
                                <div className="w-px h-4 mt-1" style={{
                                  background: seg.type === 'bus' ? seg.color : seg.type === 'walk' ? '#788c5d' : '#d97757',
                                  opacity: 0.3,
                                }} />
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
                              {seg.type === 'bus' && seg.stopsBetween && seg.stopsBetween.length > 2 && (
                                <div className="text-[10px] font-mono mt-0.5 text-muted-foreground/40">
                                  {seg.stopsBetween.length} stops along route
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
