/*
 * Home — Explore page with full Long Island map + all bus route overlays
 * Design: Claude-inspired warm dark — Space Grotesk headings, warm palette
 * Features: Collapsible sidebar, clear/reset, auto-zoom to selected route bounds
 */
import { useRef, useCallback, useEffect, useState } from 'react';
import { MapView } from '@/components/Map';
import NavHeader from '@/components/NavHeader';
import RouteSidebar from '@/components/RouteSidebar';
import RouteDetail from '@/components/RouteDetail';
import { useTransit } from '@/contexts/TransitContext';
import { LI_CENTER } from '@/lib/transitData';
import { Loader2, Bus, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SidebarProvider, SidebarToggleButton } from '@/components/MobileSidebarToggle';

export default function Home() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const { routes, routeColors, loading, selectedRoute, setSelectedRoute } = useTransit();
  const [mapReady, setMapReady] = useState(false);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setOptions({
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
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

      const color = routeColors.get(route.id) || '#6a9bcc';
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

      mainLine.addListener('click', () => {
        setSelectedRoute(selectedRoute?.id === route.id ? null : route);
      });
      glowLine.addListener('click', () => {
        setSelectedRoute(selectedRoute?.id === route.id ? null : route);
      });

      mainLine.addListener('mouseover', () => {
        if (!selectedRoute || selectedRoute.id !== route.id) {
          mainLine.setOptions({ strokeOpacity: 1, strokeWeight: 3.5 });
          glowLine.setOptions({ strokeOpacity: 0.25, strokeWeight: 7 });
        }
      });
      mainLine.addListener('mouseout', () => {
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

    const color = routeColors.get(selectedRoute.id) || '#6a9bcc';

    selectedRoute.stops.forEach((stop, i) => {
      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#141413';
      el.style.border = `2.5px solid ${color}`;
      el.style.boxShadow = `0 0 6px ${color}60`;
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 0.15s ease';
      el.title = `${stop.name} (Stop #${i + 1})`;

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.4)';
        el.style.backgroundColor = color;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
        el.style.backgroundColor = '#141413';
      });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: stop.lat, lng: stop.lon },
        content: el,
        title: stop.name,
      });

      marker.addListener('click', (e: any) => {
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

    // AUTO-ZOOM: Use the STOPS as bounds (more reliable than shape data)
    // This ensures the map zooms directly to where the route's stops actually are
    if (selectedRoute.stops.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      selectedRoute.stops.forEach(stop => {
        bounds.extend({ lat: stop.lat, lng: stop.lon });
      });
      // Also include shape points for complete coverage
      if (selectedRoute.shape && selectedRoute.shape.length > 0) {
        selectedRoute.shape.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      }
      const isMobile = window.innerWidth < 768;
      // Use generous padding to ensure the route is well-centered and visible
      mapRef.current.fitBounds(bounds, isMobile
        ? { top: 80, bottom: 60, left: 20, right: 20 }
        : { top: 80, bottom: 40, left: 340, right: 420 }
      );
    }
  }, [mapReady, selectedRoute, routeColors]);

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
              style={{ background: '#141413' }}
            >
              <motion.div
                className="relative mb-8"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Bus className="w-8 h-8" style={{ color: '#d97757' }} />
              </motion.div>
              <div
                className="text-sm tracking-tight animate-pulse"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#faf9f5', fontWeight: 500 }}
              >
                Loading transit data
              </div>
              <div
                className="text-xs mt-2"
                style={{ fontFamily: "'Source Serif 4', Georgia, serif", color: '#b0aea5' }}
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
        <AnimatePresence>
          {selectedRoute && <RouteDetail />}
        </AnimatePresence>

        {/* Clear/Reset button — visible when a route is selected */}
        <AnimatePresence>
          {selectedRoute && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleReset}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass-panel rounded-full px-4 py-2.5 flex items-center gap-2 hover:bg-white/10 transition-colors md:bottom-6"
              style={{ borderColor: 'rgba(217,119,87,0.2)' }}
              title="Clear selection & reset view"
            >
              <RotateCcw className="w-4 h-4" style={{ color: '#d97757' }} />
              <span className="text-xs font-medium" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#faf9f5' }}>
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
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#b0aea5' }}
            >
              Legend
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-0.5 rounded-full" style={{ background: '#6a9bcc', boxShadow: '0 0 4px rgba(106,155,204,0.4)' }} />
                <span className="text-[10px]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#6a9bcc' }}>Suffolk Transit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0.5 rounded-full" style={{ background: '#d97757', boxShadow: '0 0 4px rgba(217,119,87,0.4)' }} />
                <span className="text-[10px]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#d97757' }}>NICE Bus (Nassau)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
