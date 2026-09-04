export type VenueComparisonInput = {
  id: string;
  name: string;
  address?: string | null;
  latitude: number | string;
  longitude: number | string;
  source?: string | null;
  externalProvider?: string | null;
  externalId?: string | null;
};

export type DuplicateConfidence = "STRONG" | "POSSIBLE";

export type DuplicateCandidate = {
  confidence: DuplicateConfidence;
  a: VenueComparisonInput;
  b: VenueComparisonInput;
  normalizedName: string;
  distanceMeters: number;
  reasons: string[];
};

const STRONG_DISTANCE_METERS = 50;
const POSSIBLE_DISTANCE_METERS = 100;

export function normalizeVenueComparison(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeVenueName(value: string | null | undefined): string {
  return normalizeVenueComparison(value);
}

export function normalizeVenueAddress(value: string | null | undefined): string {
  return normalizeVenueComparison(value);
}

function numericCoordinate(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function distanceMeters(a: VenueComparisonInput, b: VenueComparisonInput): number {
  const lat1 = numericCoordinate(a.latitude) * Math.PI / 180;
  const lat2 = numericCoordinate(b.latitude) * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = (numericCoordinate(b.longitude) - numericCoordinate(a.longitude)) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function classifyVenuePair(a: VenueComparisonInput, b: VenueComparisonInput): DuplicateCandidate | null {
  if (a.id === b.id) return null;
  const normalizedName = normalizeVenueName(a.name);
  if (!normalizedName || normalizedName !== normalizeVenueName(b.name)) return null;
  const distance = distanceMeters(a, b);
  const sameAddress = Boolean(normalizeVenueAddress(a.address)) && normalizeVenueAddress(a.address) === normalizeVenueAddress(b.address);
  if (distance <= STRONG_DISTANCE_METERS) {
    return { confidence: "STRONG", a, b, normalizedName, distanceMeters: distance, reasons: ["nome normalizado igual", `distância <= ${STRONG_DISTANCE_METERS} m`] };
  }
  if (distance <= POSSIBLE_DISTANCE_METERS || sameAddress) {
    return { confidence: "POSSIBLE", a, b, normalizedName, distanceMeters: distance, reasons: ["nome normalizado igual", distance <= POSSIBLE_DISTANCE_METERS ? `distância <= ${POSSIBLE_DISTANCE_METERS} m` : "endereço normalizado igual"] };
  }
  return null;
}

export function detectVenueDuplicates(venues: VenueComparisonInput[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const candidate = classifyVenuePair(venues[i], venues[j]);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}
