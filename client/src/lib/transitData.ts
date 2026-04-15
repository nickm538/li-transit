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
// Suffolk: blues/cyans, Nassau: ambers/oranges
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

// Get day type for schedule lookup
export function getDayType(): 'weekday' | 'saturday' | 'sunday' {
  const day = new Date().getDay();
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

// Calculate distance between two points (haversine)
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
