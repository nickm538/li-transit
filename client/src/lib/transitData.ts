// CDN URLs for GTFS processed data
export const DATA_URLS = {
  routes:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/routes_6e9863a4.json",
  stops:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/stops_efa96089.json",
  network:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/network_45a603ab.json",
  schedules:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663213670124/dqxafGoDXFKaTAvDioc79S/schedules_81c5f024.json",
};

// Long Island center coordinates
export const LI_CENTER = { lat: 40.78, lng: -73.3 };
export const LI_BOUNDS = {
  north: 41.2,
  south: 40.5,
  east: -71.8,
  west: -73.8,
};

// Color palettes for routes
export const SUFFOLK_COLORS = [
  "#00D4FF",
  "#00B4E6",
  "#0099CC",
  "#0080B3",
  "#006699",
  "#00E5CC",
  "#00CCA3",
  "#00B38F",
  "#009980",
  "#008066",
  "#33CCFF",
  "#66D9FF",
  "#99E6FF",
  "#00BFFF",
  "#0099E6",
  "#00FFD4",
  "#33FFE0",
  "#66FFEB",
  "#00E6BF",
  "#00CCA8",
  "#4DD4FF",
  "#80E0FF",
  "#00C8FF",
  "#00AADD",
  "#0088BB",
];

export const NASSAU_COLORS = [
  "#FFB020",
  "#FF9900",
  "#FF8000",
  "#FF6600",
  "#E65C00",
  "#FFCC33",
  "#FFD966",
  "#FFE599",
  "#FFBF00",
  "#E6AC00",
  "#FF9933",
  "#FFB366",
  "#FFCC99",
  "#FF8C1A",
  "#E67300",
  "#FFD700",
  "#FFC000",
  "#FFB300",
  "#FFA500",
  "#FF9800",
  "#FFDB4D",
  "#FFE680",
  "#FFF0B3",
  "#FFD11A",
  "#E6BC00",
  "#FFA64D",
  "#FFB980",
  "#FFCCB3",
  "#FF9933",
  "#E68A00",
  "#FFCC66",
  "#FFD999",
  "#FFE5CC",
  "#FFBF33",
  "#E6AC1A",
  "#FFB84D",
  "#FFCA80",
  "#FFDCB3",
  "#FFAD33",
  "#E69C1A",
  "#FFC266",
  "#FFD499",
  "#FFE6CC",
  "#FFB833",
  "#E6A51A",
];

const NASSAU_SCHEDULES_URL = "https://www.nicebus.com/Tools/Maps-and-Schedules";

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

/** Full stop directory from CDN (`stops_*.json`) — used to resolve GTFS stop_ids not listed on a route's condensed stop list */
export type StopsCatalog = Record<
  string,
  { name: string; lat: number; lon: number }
>;

export interface NetworkData {
  nodes: Record<
    string,
    { name: string; lat: number; lon: number; county: string }
  >;
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

export type DayType = "weekday" | "saturday" | "sunday";

export interface RoutePattern {
  id: string;
  signature: string;
  label: string;
  stopIds: string[];
  stops: TransitStop[];
  dayTypes: DayType[];
  tripCount: number;
  tripIdsByDay: Partial<Record<DayType, string[]>>;
}

export interface RouteDetails {
  patterns: RoutePattern[];
  defaultPatternId: string | null;
  stopCount: number;
  serviceDays: DayType[];
  serviceLabel: string;
  frequencyLabel: string | null;
  serviceNotes: string[];
  officialUrl: string;
  officialLabel: string;
}

export const DAY_TYPES: DayType[] = ["weekday", "saturday", "sunday"];

// Assign unique colors to each route
export function assignRouteColors(routes: TransitRoute[]): Map<string, string> {
  const colorMap = new Map<string, string>();
  let suffolkIdx = 0;
  let nassauIdx = 0;

  for (const route of routes) {
    if (route.county === "Suffolk") {
      colorMap.set(
        route.id,
        SUFFOLK_COLORS[suffolkIdx % SUFFOLK_COLORS.length]
      );
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
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-07-04", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
];

// Get day type for schedule lookup — with holiday awareness
export function getDayType(date?: Date): "weekday" | "saturday" | "sunday" {
  const d = date || new Date();
  const dateStr = d.toISOString().split("T")[0];

  // Check if it's a holiday — most transit systems run Sunday schedule
  if (KNOWN_HOLIDAYS_2026.includes(dateStr)) {
    return "sunday";
  }

  const day = d.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

// Parse GTFS time (can be > 24:00:00 for next-day trips)
export function parseGtfsTime(timeStr: string): {
  hours: number;
  minutes: number;
  totalMinutes: number;
} {
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

function getOfficialRouteInfo(route: TransitRoute): {
  officialUrl: string;
  officialLabel: string;
} {
  if (route.county === "Suffolk") {
    return {
      officialUrl: `https://sctbus.org/Route-${encodeURIComponent(route.short_name)}`,
      officialLabel: "Official Suffolk route page",
    };
  }

  return {
    officialUrl: NASSAU_SCHEDULES_URL,
    officialLabel: "NICE maps & schedules",
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function roundHeadway(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

function getFirstStopBySequence(trip: TripSchedule) {
  let firstStop = trip.stops[0];

  for (let i = 1; i < trip.stops.length; i++) {
    if (trip.stops[i].sequence < firstStop.sequence) {
      firstStop = trip.stops[i];
    }
  }

  return firstStop;
}

function getTypicalHeadway(
  trips: TripSchedule[],
  mode: DayType
): number | null {
  const departures = trips
    .map(trip => {
      const firstStop = getFirstStopBySequence(trip);
      return firstStop ? parseGtfsTime(firstStop.departure).totalMinutes : null;
    })
    .filter((minutes): minutes is number => minutes !== null)
    .filter(minutes => (mode === "weekday" ? minutes < 18 * 60 : true))
    .sort((a, b) => a - b);

  if (departures.length < 2) return null;

  const diffs: number[] = [];
  for (let i = 1; i < departures.length; i++) {
    const diff = departures[i] - departures[i - 1];
    if (diff >= 10 && diff <= 180) {
      diffs.push(diff);
    }
  }

  return roundHeadway(median(diffs));
}

function getServiceLabel(serviceDays: DayType[]): string {
  const hasWeekday = serviceDays.includes("weekday");
  const hasSaturday = serviceDays.includes("saturday");
  const hasSunday = serviceDays.includes("sunday");

  if (hasWeekday && hasSaturday && hasSunday) return "Runs daily";
  if (!hasWeekday && hasSaturday && hasSunday) return "Weekends only";
  if (hasWeekday && !hasSaturday && !hasSunday) return "Weekdays only";
  if (!hasWeekday && hasSaturday && !hasSunday) return "Saturday only";
  if (!hasWeekday && !hasSaturday && hasSunday) return "Sunday only";
  if (hasWeekday && hasSaturday && !hasSunday) return "No Sunday service";
  if (hasWeekday && !hasSaturday && hasSunday) return "No Saturday service";
  return "Limited service";
}

function getFrequencyLabel(schedule?: RouteSchedule): string | null {
  if (!schedule) return null;

  const weekdayHeadway = getTypicalHeadway(schedule.weekday || [], "weekday");
  const saturdayHeadway = getTypicalHeadway(
    schedule.saturday || [],
    "saturday"
  );
  const sundayHeadway = getTypicalHeadway(schedule.sunday || [], "sunday");
  const weekendHeadway = saturdayHeadway ?? sundayHeadway;

  if (weekdayHeadway && weekendHeadway && weekdayHeadway !== weekendHeadway) {
    return `~${weekdayHeadway} min weekdays · ~${weekendHeadway} min weekends`;
  }

  const commonHeadway = weekdayHeadway ?? weekendHeadway;
  return commonHeadway ? `~${commonHeadway} min typical service` : null;
}

function buildServiceNotes(
  route: TransitRoute,
  schedule: RouteSchedule | undefined,
  serviceDays: DayType[]
): string[] {
  const notes = [getServiceLabel(serviceDays)];
  const weekdayHeadway = schedule
    ? getTypicalHeadway(schedule.weekday || [], "weekday")
    : null;
  const saturdayHeadway = schedule
    ? getTypicalHeadway(schedule.saturday || [], "saturday")
    : null;
  const sundayHeadway = schedule
    ? getTypicalHeadway(schedule.sunday || [], "sunday")
    : null;
  const weekendHeadway = saturdayHeadway ?? sundayHeadway;

  if (weekdayHeadway) {
    notes.push(`Typical weekday service every ~${weekdayHeadway} minutes`);
  }

  if (weekendHeadway) {
    notes.push(`Typical weekend service every ~${weekendHeadway} minutes`);
  }

  const totalTrips = DAY_TYPES.reduce(
    (sum, dayType) => sum + (schedule?.[dayType]?.length || 0),
    0
  );
  if (totalTrips > 0 && totalTrips <= 8) {
    notes.push("Limited scheduled trips");
  }

  notes.push(
    route.county === "Suffolk"
      ? "Official Suffolk route pages include printable schedules and rider notes"
      : "Official NICE schedules and rider notices are available from the Nassau agency page"
  );

  return notes;
}

/** Mutable per-route map: bundled stops plus any IDs pulled from `catalog` while parsing schedules */
function buildStopLookupMap(route: TransitRoute): Map<string, TransitStop> {
  const map = new Map<string, TransitStop>();
  for (const stop of route.stops) {
    map.set(stop.id, stop);
  }
  return map;
}

function getStopForTripStopId(
  lookup: Map<string, TransitStop>,
  catalog: StopsCatalog | null | undefined,
  stopId: string
): TransitStop | undefined {
  const existing = lookup.get(stopId);
  if (existing) return existing;
  const raw = catalog?.[stopId];
  if (!raw) return undefined;
  const stop: TransitStop = {
    id: stopId,
    name: raw.name,
    lat: raw.lat,
    lon: raw.lon,
  };
  lookup.set(stopId, stop);
  return stop;
}

/** Longest scheduled trip defines the fullest stop sequence for map + patterns when the bundled route stop list is condensed */
export function enrichRoutesWithScheduleStops(
  routes: TransitRoute[],
  schedules: Record<string, RouteSchedule>,
  catalog?: StopsCatalog | null
): TransitRoute[] {
  if (!catalog || Object.keys(catalog).length === 0) {
    return routes;
  }

  return routes.map(route => {
    const schedule = schedules[route.id];
    if (!schedule) return route;

    let bestTrip: TripSchedule | null = null;
    let bestLen = 0;

    for (const dayType of DAY_TYPES) {
      for (const trip of schedule[dayType] || []) {
        const n = trip.stops?.length ?? 0;
        if (n > bestLen) {
          bestLen = n;
          bestTrip = trip;
        }
      }
    }

    if (!bestTrip || bestLen < 2) return route;

    const stopLookup = buildStopLookupMap(route);
    const orderedIds = [...bestTrip.stops]
      .sort((a, b) => a.sequence - b.sequence)
      .map(st => st.stop_id)
      .filter((id, idx, arr) => idx === 0 || id !== arr[idx - 1]);

    const resolved: TransitStop[] = [];
    for (const id of orderedIds) {
      const stop = getStopForTripStopId(stopLookup, catalog, id);
      if (stop) resolved.push(stop);
    }

    if (resolved.length < 2) return route;

    if (
      resolved.length > route.stops.length ||
      route.stops.length === 0
    ) {
      return { ...route, stops: resolved };
    }

    return route;
  });
}

function getFallbackPattern(route: TransitRoute): RoutePattern {
  return {
    id: `${route.id}::fallback`,
    signature: route.stops.map(stop => stop.id).join(">"),
    label: route.long_name,
    stopIds: route.stops.map(stop => stop.id),
    stops: route.stops,
    dayTypes: [],
    tripCount: 0,
    tripIdsByDay: {},
  };
}

function getPatternViaStop(stops: TransitStop[]): string | null {
  if (stops.length < 3) return null;
  return stops[Math.floor(stops.length / 2)]?.name || null;
}

function buildPatternLabels(patterns: RoutePattern[]): RoutePattern[] {
  const baseCounts = new Map<string, number>();

  for (const pattern of patterns) {
    const firstStop = pattern.stops[0]?.name || "Start";
    const lastStop = pattern.stops[pattern.stops.length - 1]?.name || "End";
    const base = `${firstStop} → ${lastStop}`;
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  }

  return patterns.map(pattern => {
    const firstStop = pattern.stops[0]?.name || "Start";
    const lastStop = pattern.stops[pattern.stops.length - 1]?.name || "End";
    const base = `${firstStop} → ${lastStop}`;
    const via = getPatternViaStop(pattern.stops);

    return {
      ...pattern,
      label:
        (baseCounts.get(base) || 0) > 1 && via ? `${base} via ${via}` : base,
    };
  });
}

export function buildRouteDetails(
  route: TransitRoute,
  schedule?: RouteSchedule,
  catalog?: StopsCatalog | null
): RouteDetails {
  const stopLookup = buildStopLookupMap(route);
  const patternMap = new Map<string, RoutePattern>();
  const serviceDays: DayType[] = [];

  if (schedule) {
    for (const dayType of DAY_TYPES) {
      const trips = schedule[dayType] || [];
      if (trips.length > 0) {
        serviceDays.push(dayType);
      }

      for (const trip of trips) {
        const stopIds = [...trip.stops]
          .sort((a, b) => a.sequence - b.sequence)
          .map(stopTime => stopTime.stop_id)
          .filter((stopId, index, arr) => arr[index - 1] !== stopId)
          .filter(
            stopId =>
              getStopForTripStopId(stopLookup, catalog, stopId) !== undefined
          );

        if (stopIds.length < 2) continue;

        const signature = stopIds.join(">");
        const existing = patternMap.get(signature);

        if (existing) {
          existing.tripCount += 1;
          if (!existing.dayTypes.includes(dayType)) {
            existing.dayTypes.push(dayType);
          }
          existing.tripIdsByDay[dayType] = [
            ...(existing.tripIdsByDay[dayType] || []),
            trip.trip_id,
          ];
        } else {
          patternMap.set(signature, {
            id: `${route.id}::${patternMap.size + 1}`,
            signature,
            label: route.long_name,
            stopIds,
            stops: stopIds
              .map(stopId => getStopForTripStopId(stopLookup, catalog, stopId)!)
              .filter(Boolean),
            dayTypes: [dayType],
            tripCount: 1,
            tripIdsByDay: { [dayType]: [trip.trip_id] },
          });
        }
      }
    }
  }

  const patterns = buildPatternLabels(
    (patternMap.size > 0
      ? Array.from(patternMap.values())
      : [getFallbackPattern(route)]
    ).sort((a, b) => {
      if (b.tripCount !== a.tripCount) return b.tripCount - a.tripCount;
      return b.stops.length - a.stops.length;
    })
  );

  const { officialUrl, officialLabel } = getOfficialRouteInfo(route);

  return {
    patterns,
    defaultPatternId: patterns[0]?.id || null,
    stopCount: patterns[0]?.stops.length || route.stops.length,
    serviceDays,
    serviceLabel: getServiceLabel(serviceDays),
    frequencyLabel: getFrequencyLabel(schedule),
    serviceNotes: buildServiceNotes(route, schedule, serviceDays),
    officialUrl,
    officialLabel,
  };
}

export function buildRouteDetailsMap(
  routes: TransitRoute[],
  schedules: Record<string, RouteSchedule>,
  catalog?: StopsCatalog | null
): Record<string, RouteDetails> {
  return Object.fromEntries(
    routes.map(route => [
      route.id,
      buildRouteDetails(route, schedules[route.id], catalog),
    ])
  );
}

export function getActiveRoutePattern(
  details: RouteDetails | undefined,
  dayType: DayType,
  preferredPatternId?: string | null
): RoutePattern | null {
  if (!details || details.patterns.length === 0) return null;

  if (preferredPatternId) {
    const preferred = details.patterns.find(
      pattern => pattern.id === preferredPatternId
    );
    if (preferred) return preferred;
  }

  return (
    details.patterns.find(pattern => pattern.dayTypes.includes(dayType)) ||
    details.patterns[0] ||
    null
  );
}

// Format time for display
export function formatTime(timeStr: string): string {
  const { hours, minutes } = parseGtfsTime(timeStr);
  const h = hours % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

// Calculate distance between two points (haversine) in miles
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
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

export function findClosestStopInSequence(
  lat: number,
  lon: number,
  stops: TransitStop[]
): { stop: TransitStop; index: number; distance: number } | null {
  let best: TransitStop | null = null;
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const distance = haversine(lat, lon, stop.lat, stop.lon);
    if (distance < bestDist) {
      best = stop;
      bestIdx = i;
      bestDist = distance;
    }
  }

  return best ? { stop: best, index: bestIdx, distance: bestDist } : null;
}

// Find the closest stop on a specific route to a given point
export function findClosestStopOnRoute(
  lat: number,
  lon: number,
  route: TransitRoute
): { stop: TransitStop; index: number; distance: number } | null {
  return findClosestStopInSequence(lat, lon, route.stops);
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
