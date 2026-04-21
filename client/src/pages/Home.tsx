/*
 * Home — Explore page with full Long Island map + all bus route overlays
 * Design: Claude-inspired warm dark — Space Grotesk headings, warm palette
 * Features: Collapsible sidebar, clear/reset, auto-zoom to selected route bounds
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { MapView } from "@/components/Map";
import NavHeader from "@/components/NavHeader";
import RouteSidebar from "@/components/RouteSidebar";
import RouteDetail from "@/components/RouteDetail";
import { useTransit } from "@/contexts/TransitContext";
import {
  getActiveRoutePattern,
  getDayType,
  LI_CENTER,
  type TransitRoute,
  type TransitStop,
} from "@/lib/transitData";
import { Loader2, Bus, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SidebarProvider,
  SidebarToggleButton,
} from "@/components/MobileSidebarToggle";

/**
 * Build a LatLngBounds that frames the visible route for a "route overview"
 * auto-zoom. We union the polyline vertices (route.shape — exactly what the
 * user sees drawn on the map) with the displayed stops, then trim outliers
 * around the median lat/lng. This guarantees the camera lands on the drawn
 * route even if an individual catalog-resolved stop or stray shape vertex
 * sits off the actual route path.
 */
function computeRouteFitBounds(
  route: TransitRoute,
  stops: TransitStop[]
): google.maps.LatLngBounds | null {
  const points: { lat: number; lng: number }[] = [];
  if (route.shape && route.shape.length > 0) {
    for (const [lat, lng] of route.shape) {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({ lat, lng });
      }
    }
  }
  for (const stop of stops) {
    if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
      points.push({ lat: stop.lat, lng: stop.lon });
    }
  }
  if (points.length === 0) return null;

  // Median is robust to outliers (unlike min/max). Long Island's full N-S
  // extent is < 30 miles, so a generous 0.5° window (~35 miles) around the
  // median includes every legitimate point on any LI bus route while still
  // excluding any malformed vertex/stop that would otherwise pull the camera
  // off-route.
  const lats = points.map(p => p.lat).sort((a, b) => a - b);
  const lngs = points.map(p => p.lng).sort((a, b) => a - b);
  const medianLat = lats[Math.floor(lats.length / 2)];
  const medianLng = lngs[Math.floor(lngs.length / 2)];
  const MAX_DELTA_DEG = 0.5;

  const bounds = new google.maps.LatLngBounds();
  let kept = 0;
  for (const p of points) {
    if (
      Math.abs(p.lat - medianLat) <= MAX_DELTA_DEG &&
      Math.abs(p.lng - medianLng) <= MAX_DELTA_DEG
    ) {
      bounds.extend(p);
      kept++;
    }
  }
  if (kept === 0 || bounds.isEmpty()) return null;
  return bounds;
}

export default function Home() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const {
    routes,
    routeColors,
    routeDetailsById,
    loading,
    selectedRoute,
    setSelectedRoute,
  } = useTransit();
  const [mapReady, setMapReady] = useState(false);
  const dayType = getDayType();

  // Ref mirror of selectedRoute?.id — updated on every render so that deferred
  // callbacks (e.g. the fitBounds RAF below) can detect a selection change
  // that happened after the effect captured its closure.
  const selectedRouteIdRef = useRef<string | null>(null);
  selectedRouteIdRef.current = selectedRoute?.id ?? null;

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setOptions({
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
      minZoom: 8,
      maxZoom: 20,
      restriction: {
        latLngBounds: { north: 41.5, south: 40.2, east: -71.0, west: -74.2 },
        strictBounds: false,
      },
      keyboardShortcuts: true,
      scrollwheel: true,
      disableDoubleClickZoom: false,
      draggable: true,
    });

    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, []);

  // Reset / clear handler — deselect route, reset map view
  const handleReset = useCallback(() => {
    setSelectedRoute(null);
    if (mapRef.current) {
      mapRef.current.panTo(LI_CENTER);
      mapRef.current.setZoom(9);
    }
    if (infoWindowRef.current) infoWindowRef.current.close();
  }, [setSelectedRoute]);

  // Draw all routes on the map
  useEffect(() => {
    if (!mapReady || !mapRef.current || routes.length === 0) return;

    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    routes.forEach(route => {
      if (!route.shape || route.shape.length < 2) return;

      const color = routeColors.get(route.id) || "#6a9bcc";
      const isSelected = selectedRoute?.id === route.id;
      const hasSelection = selectedRoute !== null;

      const glowLine = new google.maps.Polyline({
        path: route.shape.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: color,
        strokeOpacity: isSelected ? 0.35 : hasSelection ? 0.04 : 0.12,
        strokeWeight: isSelected ? 8 : 4,
        map: mapRef.current,
        zIndex: isSelected ? 10 : 1,
      });

      const mainLine = new google.maps.Polyline({
        path: route.shape.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: color,
        strokeOpacity: isSelected ? 1 : hasSelection ? 0.18 : 0.65,
        strokeWeight: isSelected ? 4 : 2.5,
        map: mapRef.current,
        zIndex: isSelected ? 11 : 2,
      });

      mainLine.addListener("click", () => {
        setSelectedRoute(selectedRoute?.id === route.id ? null : route);
      });
      glowLine.addListener("click", () => {
        setSelectedRoute(selectedRoute?.id === route.id ? null : route);
      });

      mainLine.addListener("mouseover", () => {
        if (!selectedRoute || selectedRoute.id !== route.id) {
          mainLine.setOptions({ strokeOpacity: 1, strokeWeight: 3.5 });
          glowLine.setOptions({ strokeOpacity: 0.25, strokeWeight: 7 });
        }
      });
      mainLine.addListener("mouseout", () => {
        if (!selectedRoute || selectedRoute.id !== route.id) {
          mainLine.setOptions({
            strokeOpacity: hasSelection ? 0.18 : 0.65,
            strokeWeight: 2.5,
          });
          glowLine.setOptions({
            strokeOpacity: hasSelection ? 0.04 : 0.12,
            strokeWeight: 4,
          });
        }
      });

      polylinesRef.current.push(glowLine, mainLine);
    });
  }, [mapReady, routes, routeColors, selectedRoute, setSelectedRoute]);

  // Show stop markers when a route is selected — AUTO-ZOOM to route bounds
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    if (!selectedRoute) return;

    const color = routeColors.get(selectedRoute.id) || "#6a9bcc";
    const activePattern = getActiveRoutePattern(
      routeDetailsById[selectedRoute.id],
      dayType,
      null
    );
    const displayedStops = activePattern?.stops || selectedRoute.stops;

    displayedStops.forEach((stop, i) => {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = "#141413";
      el.style.border = `2.5px solid ${color}`;
      el.style.boxShadow = `0 0 6px ${color}60`;
      el.style.cursor = "pointer";
      el.style.transition = "transform 0.15s ease";
      el.title = `${stop.name} (Stop #${i + 1})`;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.4)";
        el.style.backgroundColor = color;
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        el.style.backgroundColor = "#141413";
      });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: stop.lat, lng: stop.lon },
        content: el,
        title: stop.name,
      });

      marker.addListener("click", (e: any) => {
        if (e && e.stop) e.stop();

        if (infoWindowRef.current && mapRef.current) {
          const infoContent = `
            <div style="
              font-family: 'Space Grotesk', system-ui, sans-serif;
              background: rgba(20,20,19,0.95);
              color: #faf9f5;
              padding: 12px 16px;
              border-radius: 10px;
              border: 1px solid ${color}30;
              min-width: 180px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.4);
              backdrop-filter: blur(12px);
            ">
              <div style="
                font-size: 11px;
                font-weight: 500;
                color: ${color};
                margin-bottom: 4px;
                letter-spacing: -0.01em;
              ">
                Stop #${i + 1}
              </div>
              <div style="
                font-size: 13px;
                font-weight: 500;
                color: #faf9f5;
                margin-bottom: 6px;
                line-height: 1.35;
                letter-spacing: -0.015em;
              ">
                ${stop.name}
              </div>
              <div style="
                font-size: 10px;
                font-family: 'JetBrains Mono', monospace;
                color: #b0aea5;
              ">
                ${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}
              </div>
              <div style="
                font-size: 10px;
                color: ${color};
                margin-top: 5px;
                opacity: 0.8;
              ">
                Route ${selectedRoute.short_name} · ${selectedRoute.county}
              </div>
            </div>
          `;

          infoWindowRef.current.setContent(infoContent);
          infoWindowRef.current.open({
            map: mapRef.current,
            anchor: marker,
          });
        }
      });

      markersRef.current.push(marker);
    });

    // AUTO-ZOOM: Frame the selected route using the visible polyline (route.shape)
    // unioned with its displayed stops, then trim outliers around the median so a
    // stray shape vertex or catalog-resolved stop can't pull the camera off-route.
    // Using shape as the primary source guarantees bounds match what the user sees
    // drawn on the map — the earlier stop-only approach could miszoom the first
    // click when an enriched stop sat off the actual route path.
    const bounds = computeRouteFitBounds(selectedRoute, displayedStops);
    if (bounds) {
      const isMobile = window.innerWidth < 768;
      const padding = isMobile
        ? { top: 80, bottom: 60, left: 20, right: 20 }
        : { top: 80, bottom: 40, left: 340, right: 420 };

      const targetMap = mapRef.current;
      const targetRouteId = selectedRoute.id;

      const runFit = () => {
        if (!mapRef.current || mapRef.current !== targetMap) return;
        if (selectedRouteIdRef.current !== targetRouteId) return;
        targetMap.fitBounds(bounds, padding);
      };

      // Defer past the current commit so the polyline/marker additions from
      // this same render flush first. Two RAFs reliably place fitBounds after
      // the browser has painted the new overlay state. (A previous revision
      // waited on the map's `idle` event here, but that event can fire
      // transiently while the 138-route polyline redraw is still committing —
      // causing fitBounds to run against an in-flight projection on the first
      // click and land on an unrelated part of Long Island.)
      let cancelled = false;
      let raf2: number | null = null;
      let fallbackTimer: number | null = null;

      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (cancelled) return;
          if (fallbackTimer !== null) {
            window.clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          runFit();
        });
      });

      // Hard fallback in case RAFs are starved (e.g. tab backgrounded while
      // selection was changing). Guarantees the map reaches the route overview.
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        if (cancelled) return;
        runFit();
      }, 400);

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
        if (raf2 !== null) cancelAnimationFrame(raf2);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      };
    }
  }, [dayType, mapReady, routeDetailsById, routeColors, selectedRoute]);

  return (
    <SidebarProvider>
      <div className="h-[100dvh] w-screen overflow-hidden bg-background relative">
        <NavHeader />

        {/* Sidebar toggle button — works on both mobile and desktop */}
        {!loading && <SidebarToggleButton />}

        {/* Loading overlay — Claude-warm style */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center"
              style={{ background: "#141413" }}
            >
              <motion.div
                className="relative mb-8"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Bus className="w-8 h-8" style={{ color: "#d97757" }} />
              </motion.div>
              <div
                className="text-sm tracking-tight animate-pulse"
                style={{
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  color: "#faf9f5",
                  fontWeight: 500,
                }}
              >
                Loading transit data
              </div>
              <div
                className="text-xs mt-2"
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  color: "#b0aea5",
                }}
              >
                69 routes · 4,748 stops · Nassau & Suffolk
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map — fills entire viewport below nav, fully interactive */}
        <div className="absolute inset-0 top-14 map-container">
          <MapView
            className="w-full h-full"
            initialCenter={LI_CENTER}
            initialZoom={9}
            onMapReady={handleMapReady}
          />
        </div>

        {/* Sidebar — collapsible */}
        {!loading && <RouteSidebar />}

        {/* Route detail panel */}
        <AnimatePresence>{selectedRoute && <RouteDetail />}</AnimatePresence>

        {/* Clear/Reset button — visible when a route is selected */}
        <AnimatePresence>
          {selectedRoute && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleReset}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass-panel rounded-full px-4 py-2.5 flex items-center gap-2 hover:bg-white/10 transition-colors md:bottom-6"
              style={{ borderColor: "rgba(217,119,87,0.2)" }}
              title="Clear selection & reset view"
            >
              <RotateCcw className="w-4 h-4" style={{ color: "#d97757" }} />
              <span
                className="text-xs font-medium"
                style={{
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  color: "#faf9f5",
                }}
              >
                Reset View
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Map legend — Claude-warm style */}
        {!loading && !selectedRoute && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 md:bottom-4 z-20 glass-panel rounded-xl p-2.5 md:p-3">
            <div
              className="text-[10px] font-medium tracking-wide uppercase mb-1.5"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                color: "#b0aea5",
              }}
            >
              Legend
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-0.5 rounded-full"
                  style={{
                    background: "#6a9bcc",
                    boxShadow: "0 0 4px rgba(106,155,204,0.4)",
                  }}
                />
                <span
                  className="text-[10px]"
                  style={{
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    color: "#6a9bcc",
                  }}
                >
                  Suffolk Transit
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-0.5 rounded-full"
                  style={{
                    background: "#d97757",
                    boxShadow: "0 0 4px rgba(217,119,87,0.4)",
                  }}
                />
                <span
                  className="text-[10px]"
                  style={{
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    color: "#d97757",
                  }}
                >
                  NICE Bus (Nassau)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
