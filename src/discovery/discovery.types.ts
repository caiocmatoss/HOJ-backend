export type NearbyPlace = {
  id: string;
  externalId: string;
  source: 'FOURSQUARE' | 'LOCAL';
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  address: string | null;
  locality: string | null;
  region: string | null;
  venueId: string | null;
};
