import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { VenuesService } from '../venues/venues.service';
import type { NearbyPlace } from './discovery.types';

const MAX_RADIUS_METERS = 5000;
const CACHE_TTL_MS = 30_000;
const PROVIDER_URL = 'https://places-api.foursquare.com/places/search';
const PROVIDER_VERSION = '2025-06-17';
// IDs accepted by the current Places API for the product's nightlife, dining and live-music POIs.
const CATEGORY_IDS = [
  '4bf58dd8d48988d116941735', // Bar
  '4bf58dd8d48988d11f941735', // Nightclub
  '4bf58dd8d48988d110941735', // Restaurant
  '4bf58dd8d48988d120941735', // Concert hall
];

type CacheEntry = { expiresAt: number; value: NearbyPlace[] };
type ProviderPlace = {
  fsq_place_id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  categories?: Array<{ name?: string; short_name?: string }>;
  location?: { formatted_address?: string; locality?: string; region?: string };
  distance?: number;
};

function distanceMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latitude2 - latitude1);
  const dLng = radians(longitude2 - longitude1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly venuesService: VenuesService) {}

  async nearby(latitude: number, longitude: number, radius = MAX_RADIUS_METERS): Promise<NearbyPlace[]> {
    const boundedRadius = Math.min(Math.max(radius, 1), MAX_RADIUS_METERS);
    const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${boundedRadius}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const localVenues = await this.venuesService.findAll({ latitude, longitude, radius: boundedRadius / 1000 });
    const localByExternalId = new Set<string>();
    const localPlaces = (localVenues as Array<{ id: string; name: string; category: string; address: string; latitude: number; longitude: number; externalId?: string | null; locality?: string | null; region?: string | null }>).flatMap((venue) => {
      const venueLatitude = Number(venue.latitude);
      const venueLongitude = Number(venue.longitude);
      if (!Number.isFinite(venueLatitude) || !Number.isFinite(venueLongitude)) return [];
      if (venue.externalId) localByExternalId.add(venue.externalId);
      return [{ id: venue.id, externalId: venue.externalId ?? venue.id, source: 'LOCAL' as const, name: venue.name, category: venue.category, latitude: venueLatitude, longitude: venueLongitude, distanceMeters: distanceMeters(latitude, longitude, venueLatitude, venueLongitude), address: venue.address ?? null, locality: venue.locality ?? null, region: venue.region ?? null, venueId: venue.id }];
    });

    const token = process.env.FSQ_PLACES_TOKEN?.trim();
    const external = token ? await this.fetchPlaces(latitude, longitude, boundedRadius, token) : [];
    const merged = [...localPlaces, ...external.filter((place) => place.distanceMeters <= MAX_RADIUS_METERS && !localByExternalId.has(place.externalId))];
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: merged });
    return merged;
  }

  private async fetchPlaces(latitude: number, longitude: number, radius: number, token: string): Promise<NearbyPlace[]> {
    const query = new URLSearchParams({ ll: `${latitude},${longitude}`, radius: String(radius), sort: 'DISTANCE', limit: '50', fsq_category_ids: CATEGORY_IDS.join(','), fields: 'fsq_place_id,name,categories,latitude,longitude,location,distance' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${PROVIDER_URL}?${query.toString()}`, { headers: { Authorization: `Bearer ${token}`, 'X-Places-Api-Version': PROVIDER_VERSION, Accept: 'application/json' }, signal: controller.signal });
      if (response.status === 401 || response.status === 429) throw new ServiceUnavailableException('Serviço de descoberta temporariamente indisponível.');
      if (!response.ok) throw new ServiceUnavailableException('Serviço de descoberta temporariamente indisponível.');
      const payload = await response.json() as { results?: ProviderPlace[] };
      return (payload.results ?? []).flatMap((place) => {
        const id = place.fsq_place_id;
        const lat = Number(place.latitude);
        const lng = Number(place.longitude);
        if (!id || !place.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        const providerDistance = Number(place.distance);
        return [{ id: `fsq:${id}`, externalId: id, source: 'FOURSQUARE' as const, name: place.name, category: place.categories?.[0]?.name ?? 'Lugar', latitude: lat, longitude: lng, distanceMeters: Number.isFinite(providerDistance) ? providerDistance : distanceMeters(latitude, longitude, lat, lng), address: place.location?.formatted_address ?? null, locality: place.location?.locality ?? null, region: place.location?.region ?? null, venueId: null }];
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('Foursquare discovery request failed.');
      throw new ServiceUnavailableException('Serviço de descoberta temporariamente indisponível.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
