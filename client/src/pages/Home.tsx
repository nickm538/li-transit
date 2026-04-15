/*
 * Home — Explore page with full Long Island map + all bus route overlays
 * Design: Transit Control Room — dark, full-bleed map, glass panels
 * Map: Google Maps with all 69 routes overlaid with unique colors
 * Mobile: Bottom sheet for route list, responsive panels
 */
import { useRef, useCallback, useEffect, useState } from 'react';
import { MapView } from '@/components/Map';
import NavHeader from '@/components/NavHeader';
import RouteSidebar from '@/components/RouteSidebar';
import RouteDetail from '@/components/RouteDetail';
import { useTransit } from '@/contexts/TransitContext';
import { LI_CENTER } from '@/lib/transitData';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SidebarProvider, MobileSidebarToggle } from '@/components/MobileSidebarToggle';

export default function Home() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
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
      minZoom: 9,
      maxZoom: 20,
      restriction: {
        latLngBounds: { north: 41.3, south: 40.3, east: -71.5, west: -74.0 },
        strictBounds: false,
      },
    });
    setMapReady(true);
  }, []);

  // Draw all routes on the map
  useEffect(() => {
    if (!mapReady || !mapRef.current || routes.length === 0) return;

    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    routes.forEach(route => {
      if (!route.shape || route.shape.length < 2) return;

      const color = routeColors.get(route.id) || '#00D4FF';
      const isSelected = selectedRoute?.id === route.id;
      const hasSelection = selectedRoute !== null;

      const glowLine = new google.maps.Polyline({
        path: route.shape.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: color,
        strokeOpacity: isSelected ? 0.4 : hasSelection ? 0.05 : 0.15,
        strokeWeight: isSelected ? 8 : 4,
        map: mapRef.current,
        zIndex: isSelected ? 10 : 1,
      });

      const mainLine = new google.maps.Polyline({
        path: route.shape.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: color,
        strokeOpacity: isSelected ? 1 : hasSelection ? 0.2 : 0.7,
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
          glowLine.setOptions({ strokeOpacity: 0.3, strokeWeight: 7 });
        }
      });
      mainLine.addListener('mouseout', () => {
        if (!selectedRoute || selectedRoute.id !== route.id) {
          mainLine.setOptions({
            strokeOpacity: hasSelection ? 0.2 : 0.7,
            strokeWeight: 2.5,
          });
          glowLine.setOptions({
            strokeOpacity: hasSelection ? 0.05 : 0.15,
            strokeWeight: 4,
          });
        }
      });

      polylinesRef.current.push(glowLine, mainLine);
    });
  }, [mapReady, routes, routeColors, selectedRoute, setSelectedRoute]);

  // Show stop markers when a route is selected
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];

    if (!selectedRoute) return;

    const color = routeColors.get(selectedRoute.id) || '#00D4FF';

    selectedRoute.stops.forEach((stop, i) => {
      const el = document.createElement('div');
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#0D1117';
      el.style.border = `2px solid ${color}`;
      el.style.boxShadow = `0 0 6px ${color}80`;
      el.style.cursor = 'pointer';
      el.title = `${stop.name} (Stop #${i + 1})`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: stop.lat, lng: stop.lon },
        content: el,
        title: stop.name,
      });

      markersRef.current.push(marker);
    });

    // Fit map to selected route bounds — responsive padding
    if (selectedRoute.shape.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      selectedRoute.shape.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      const isMobile = window.innerWidth < 768;
      mapRef.current.fitBounds(bounds, isMobile
        ? { top: 80, bottom: 20, left: 20, right: 20 }
        : { top: 80, bottom: 20, left: 340, right: 420 }
      );
    }
  }, [mapReady, selectedRoute, routeColors]);

  return (
    <SidebarProvider>
      <div className="h-[100dvh] w-screen overflow-hidden bg-background relative">
        <NavHeader />
        <MobileSidebarToggle />

        {/* Loading overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background"
            >
              <div className="relative mb-6">
                <Loader2 className="w-10 h-10 text-[#00D4FF] animate-spin" />
                <div className="absolute inset-0 w-10 h-10 rounded-full border border-[#00D4FF]/20 animate-ping" />
              </div>
              <div className="font-mono text-sm text-[#00D4FF] tracking-wider animate-pulse">
                LOADING TRANSIT DATA
              </div>
              <div className="font-mono text-xs text-muted-foreground mt-2">
                69 routes &middot; 4,748 stops &middot; Nassau &amp; Suffolk
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map */}
        <MapView
          className="w-full h-full"
          initialCenter={LI_CENTER}
          initialZoom={10}
          onMapReady={handleMapReady}
        />

        {/* Sidebar */}
        {!loading && <RouteSidebar />}

        {/* Route detail panel */}
        <AnimatePresence>
          {selectedRoute && <RouteDetail />}
        </AnimatePresence>

        {/* Map legend — repositioned for mobile */}
        {!loading && (
          <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 glass-panel rounded-lg p-2 md:p-3">
            <div className="text-[10px] font-mono font-bold tracking-wider text-muted-foreground uppercase mb-1.5">
              Legend
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-0.5 rounded-full bg-[#00D4FF]" style={{ boxShadow: '0 0 4px #00D4FF80' }} />
                <span className="text-[10px] text-[#00D4FF] font-mono">Suffolk Transit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-0.5 rounded-full bg-[#FFB020]" style={{ boxShadow: '0 0 4px #FFB02080' }} />
                <span className="text-[10px] text-[#FFB020] font-mono">NICE Bus (Nassau)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
