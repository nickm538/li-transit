/**
 * GOOGLE MAPS FRONTEND INTEGRATION
 * Loads directly from maps.googleapis.com with key= param.
 * Falls back to Manus Forge proxy if VITE_FRONTEND_FORGE_API_URL is set.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
    _mapsLoading?: Promise<void>;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_API_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL;
const MAP_ID =
  import.meta.env.VITE_GOOGLE_MAP_ID ||
  import.meta.env.VITE_FRONTEND_FORGE_MAP_ID;
const MAPS_SCRIPT_URL = FORGE_API_URL
  ? `${FORGE_API_URL}/v1/maps/proxy/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`
  : `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`;

// Singleton promise to prevent loading the script multiple times
function loadMapScript(): Promise<void> {
  if (window.google?.maps) {
    return Promise.resolve();
  }
  if (window._mapsLoading) {
    return window._mapsLoading;
  }
  window._mapsLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPS_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      window._mapsLoading = undefined;
      setTimeout(() => {
        const retryScript = document.createElement("script");
        retryScript.src = script.src;
        retryScript.async = true;
        retryScript.crossOrigin = "anonymous";
        retryScript.onload = () => resolve();
        retryScript.onerror = () => {
          console.error("Google Maps retry also failed");
          reject(new Error("Failed to load Google Maps"));
        };
        document.head.appendChild(retryScript);
      }, 1000);
    };
    document.head.appendChild(script);
  });
  return window._mapsLoading;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [mapError, setMapError] = useState(false);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
      if (!mapContainer.current || map.current) return;
      map.current = new window.google!.maps.Map(mapContainer.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeControl: true,
        fullscreenControl: true,
        zoomControl: true,
        streetViewControl: true,
        ...(MAP_ID ? { mapId: MAP_ID } : {}),
      });
      if (onMapReady) {
        onMapReady(map.current);
      }
    } catch (error) {
      console.error("Google Maps failed to initialize:", error);
      setMapError(true);
      window._mapsLoading = undefined;
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div
        ref={mapContainer}
        data-map-canvas="true"
        className="w-full h-full"
      />
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 z-10">
          <div
            className="text-sm font-medium"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#d97757' }}
          >
            Map failed to load
          </div>
          <div
            className="text-xs max-w-xs"
            style={{ fontFamily: "'Source Serif 4', Georgia, serif", color: '#b0aea5' }}
          >
            Google Maps could not be loaded. Check your connection and try again.
          </div>
          <button
            onClick={() => {
              setMapError(false);
              map.current = null;
              init();
            }}
            className="mt-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              background: 'rgba(217,119,87,0.15)',
              border: '1px solid rgba(217,119,87,0.3)',
              color: '#d97757',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
