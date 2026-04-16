import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DATA_URLS,
  assignRouteColors,
  buildRouteDetailsMap,
  type TransitRoute,
  type NetworkData,
  type RouteSchedule,
  type RouteDetails,
} from '@/lib/transitData';

interface TransitState {
  routes: TransitRoute[];
  network: NetworkData | null;
  schedules: Record<string, RouteSchedule>;
  routeDetailsById: Record<string, RouteDetails>;
  routeColors: Map<string, string>;
  loading: boolean;
  schedulesLoading: boolean;
  error: string | null;
  selectedRoute: TransitRoute | null;
  selectedRoutePatternId: string | null;
  setSelectedRoute: (route: TransitRoute | null) => void;
  setSelectedRoutePatternId: (patternId: string | null) => void;
  lastUpdated: string | null;
}

const TransitContext = createContext<TransitState | null>(null);

export function TransitProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [schedules, setSchedules] = useState<Record<string, RouteSchedule>>({});
  const [routeDetailsById, setRouteDetailsById] = useState<Record<string, RouteDetails>>({});
  const [routeColors, setRouteColors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<TransitRoute | null>(null);
  const [selectedRoutePatternId, setSelectedRoutePatternId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Load routes, network, AND schedules in parallel — schedules are critical for routing
        const [routesRes, networkRes, schedulesRes] = await Promise.all([
          fetch(DATA_URLS.routes),
          fetch(DATA_URLS.network),
          fetch(DATA_URLS.schedules),
        ]);

        if (!routesRes.ok || !networkRes.ok) {
          throw new Error('Failed to fetch transit data');
        }

        const routesData: TransitRoute[] = await routesRes.json();
        const networkData: NetworkData = await networkRes.json();

        setRoutes(routesData);
        setNetwork(networkData);
        setRouteColors(assignRouteColors(routesData));
        setLastUpdated(new Date().toISOString());

        // Parse schedules
        if (schedulesRes.ok) {
          const schedulesData = await schedulesRes.json();
          setSchedules(schedulesData);
          setRouteDetailsById(buildRouteDetailsMap(routesData, schedulesData));
        } else {
          setRouteDetailsById(buildRouteDetailsMap(routesData, {}));
        }
        setSchedulesLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transit data');
        setSchedulesLoading(false);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <TransitContext.Provider
      value={{
        routes,
        network,
        schedules,
        routeDetailsById,
        routeColors,
        loading,
        schedulesLoading,
        error,
        selectedRoute,
        selectedRoutePatternId,
        setSelectedRoute: (route) => {
          setSelectedRoute(route);
          setSelectedRoutePatternId(null);
        },
        setSelectedRoutePatternId,
        lastUpdated,
      }}
    >
      {children}
    </TransitContext.Provider>
  );
}

export function useTransit() {
  const ctx = useContext(TransitContext);
  if (!ctx) throw new Error('useTransit must be used within TransitProvider');
  return ctx;
}
