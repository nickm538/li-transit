// CDN URLs for GTFS processed data
export const DATA_URLS = {
  routes: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/routes_6e9863a4.json',
  stops: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/stops_efa96089.json',
  network: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/network_45a603ab.json',
  schedules: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/schedules_81c5f024.json',
};

// Long Island center coordinates
export const LI_CENTER = { lat: 40.79, lng: -73.2 };
export const LI_BOUNDS = {
  north: 41.2,
  south: 40.5,
  east: -71.8,
  west: -73.8,
};

// Color palettes for routes
export const SUFFOLK_COLORS = [
  '#00D4FF', '#00B4E6', '#0099CC', '#0080B3', '#006699',
  '#00E5CC', '#00CCA3', '#00B38F', '#009980', '#008066',
  '#33CCFF', '#66D9FF', '#99E6FF', '#00BFFF', '#0099E6',
  '#00FFD4', '#33FFE0', '#66FFEB', '#00E6BF', '#00CCA8',
  '#4DD4FF', '#80E0FF', '#00C8FF', '#00AADD', '#0088BB',
];

export const NASSAU_COLORS = [
  '#FFB020', '#FF9900', '#FF8000', '#FF6600', '#E65C00',
  '#FFCC33', '#FFD966', '#FFE599', '#FFBF00', '#E6AC00',
  '#FF9933', '#FFB366', '#FFCC99', '#FF8C1A', '#E67300',
  '#FFD700', '#FFC000', '#FFB300', '#FFA500', '#FF9800',
  '#FFDB4D', '#FFE680', '#FFF0B3', '#FFD11A', '#E6BC00',
  '#FFA64D', '#FFB980', '#FFCCB3', '#FF9933', '#E68A00',
  '#FFCC66', '#FFD999', '#FFE5CC', '#FFBF33', '#E6AC1A',
  '#FFB84D', '#FFCA80', '#FFDCB3', '#FFAD33', '#E69C1A',
  '#FFC266', '#FFD499', '#FFE6CC', '#FFB833', '#E6A51A',
];

export interface TransitRoute {
  id: string;
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  county: string;
  shape: [number, number][];
  stops: TransitStop[];
}

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface NetworkData {
  nodes: Record<string, { name: string; lat: number; lon: number; county: string }>;
  edges: { from: string; to: string; distance: number; routes: string[] }[];
}

export interface RouteSchedule {
  weekday: TripSchedule[];
  saturday: TripSchedule[];
  sunday: TripSchedule[];
}

export interface TripSchedule {
  trip_id: string;
  stops: {
    stop_id: string;
    arrival: string;
    departure: string;
    sequence: number;
  }[];
}

// Assign unique colors to each route
export function assignRouteColors(routes: TransitRoute[]): Map<string, string> {
  const colorMap = new Map<string, string>();
  let suffolkIdx = 0;
  let nassauIdx = 0;

  for (const route of routes) {
    if (route.county === 'Suffolk') {
      colorMap.set(route.id, SUFFOLK_COLORS[suffolkIdx % SUFFOLK_COLORS.length]);
      suffolkIdx++;
    } else {
      colorMap.set(route.id, NASSAU_COLORS[nassauIdx % NASSAU_COLORS.length]);
      nassauIdx++;
    }
  }
  return colorMap;
}

// Known US federal holidays that may affect transit (Sunday schedule typically)
const KNOWN_HOLIDAYS_2026: string[] = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-05-25', // Memorial Day
  '2026-07-04', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

// Get day type for schedule lookup — with holiday awareness
export function getDayType(date?: Date): 'weekday' | 'saturday' | 'sunday' {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0];

  // Check if it's a holiday — most transit systems run Sunday schedule
  if (KNOWN_HOLIDAYS_2026.includes(dateStr)) {
    return 'sunday';
  }

  const day = d.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

// Parse GTFS time (can be > 24:00:00 for next-day trips)
export function parseGtfsTime(timeStr: string): { hours: number; minutes: number; totalMinutes: number } {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

// Format time for display
export function formatTime(timeStr: string): string {
  const { hours, minutes } = parseGtfsTime(timeStr);
  const h = hours % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Calculate distance between two points (haversine) in miles
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Find nearest stop to a given lat/lon
export function findNearestStop(
  lat: number,
  lon: number,
  stops: TransitStop[]
): { stop: TransitStop; distance: number } | null {
  let nearest: TransitStop | null = null;
  let minDist = Infinity;

  for (const stop of stops) {
    const d = haversine(lat, lon, stop.lat, stop.lon);
    if (d < minDist) {
      minDist = d;
      nearest = stop;
    }
  }

  return nearest ? { stop: nearest, distance: minDist } : null;
}

// Find N nearest stops within a radius
export function findNearestStops(
  lat: number,
  lon: number,
  stops: TransitStop[],
  maxCount: number = 10,
  maxRadius: number = 3 // miles
): { stop: TransitStop; distance: number }[] {
  const candidates: { stop: TransitStop; distance: number }[] = [];

  for (const stop of stops) {
    const d = haversine(lat, lon, stop.lat, stop.lon);
    if (d <= maxRadius) {
      candidates.push({ stop, distance: d });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, maxCount);
}

// Find all routes that serve a given stop
export function findRoutesForStop(
  stopId: string,
  routes: TransitRoute[]
): TransitRoute[] {
  return routes.filter(r => r.stops.some(s => s.id === stopId));
}

// Find the closest stop on a specific route to a given point
export function findClosestStopOnRoute(
  lat: number,
  lon: number,
  route: TransitRoute
): { stop: TransitStop; index: number; distance: number } | null {
  let best: TransitStop | null = null;
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < route.stops.length; i++) {
    const s = route.stops[i];
    const d = haversine(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
      bestIdx = i;
    }
  }

  return best ? { stop: best, index: bestIdx, distance: bestDist } : null;
}

// Estimate walking time in minutes (average 3 mph walking speed)
export function estimateWalkTime(distanceMiles: number): number {
  return Math.round(distanceMiles * 20); // 20 min per mile = 3 mph
}

// Estimate biking time in minutes (average 10 mph)
export function estimateBikeTime(distanceMiles: number): number {
  return Math.round(distanceMiles * 6); // 6 min per mile = 10 mph
}

// Check if a distance is walkable (under 1.5 miles ~ 30 min walk)
export function isWalkable(distanceMiles: number): boolean {
  return distanceMiles <= 1.5;
}

// Check if a distance is bikeable (under 5 miles ~ 30 min bike)
export function isBikeable(distanceMiles: number): boolean {
  return distanceMiles <= 5;
}

// Get current time as minutes since midnight
export function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Format minutes as human-readable duration
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Format distance
export function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

// Find the nearest point index on a route shape to a given lat/lon
export function findNearestShapeIndex(
  lat: number,
  lon: number,
  shape: [number, number][]
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d = haversine(lat, lon, shape[i][0], shape[i][1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Slice a route shape between two stops, returning only the relevant portion
// Returns the shape points from the nearest point to fromStop through to the nearest point to toStop
export function sliceRouteShape(
  route: TransitRoute,
  fromStop: TransitStop,
  toStop: TransitStop
): [number, number][] {
  const shape = route.shape;
  if (!shape || shape.length < 2) return [];

  const fromIdx = findNearestShapeIndex(fromStop.lat, fromStop.lon, shape);
  const toIdx = findNearestShapeIndex(toStop.lat, toStop.lon, shape);

  if (fromIdx === toIdx) {
    return [shape[fromIdx]];
  }

  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);

  // Include a small buffer on each side for smoother rendering
  const bufferStart = Math.max(0, start - 1);
  const bufferEnd = Math.min(shape.length - 1, end + 1);

  return shape.slice(bufferStart, bufferEnd + 1);
}
