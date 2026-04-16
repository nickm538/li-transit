/**
 * GOOGLE MAPS FRONTEND INTEGRATION
 * Uses Manus proxy for authentication - no API key needed from user.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
    _mapsLoading?: Promise<void>;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

// Singleton promise to prevent loading the script multiple times
function loadMapScript(): Promise<void> {
  if (window.google?.maps) {
    return Promise.resolve();
  }
  if (window._mapsLoading) {
    return window._mapsLoading;
  }
  window._mapsLoading = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      // Retry once
      window._mapsLoading = undefined;
      setTimeout(() => {
        const retryScript = document.createElement("script");
        retryScript.src = script.src;
        retryScript.async = true;
        retryScript.crossOrigin = "anonymous";
        retryScript.onload = () => resolve();
        retryScript.onerror = () => console.error("Google Maps retry also failed");
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

  const init = usePersistFn(async () => {
    await loadMapScript();
    if (!mapContainer.current || map.current) return;
    map.current = new window.google!.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div
      ref={mapContainer}
      data-map-canvas="true"
      className={cn("w-full h-[500px]", className)}
    />
  );
}
