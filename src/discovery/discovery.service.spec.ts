import { ServiceUnavailableException } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';

describe('DiscoveryService', () => {
  const venuesService = { findAll: jest.fn() } as never;
  let service: DiscoveryService;

  beforeEach(() => {
    process.env.FSQ_PLACES_TOKEN = 'test-token';
    venuesService.findAll.mockResolvedValue([]);
    service = new DiscoveryService(venuesService as never);
  });

  afterEach(() => {
    delete process.env.FSQ_PLACES_TOKEN;
    jest.restoreAllMocks();
  });

  function providerResponse(distance: number, id = 'place-1') {
    return { ok: true, status: 200, json: async () => ({ results: [{ fsq_place_id: id, name: 'Place', categories: [{ name: 'Bar' }], latitude: -23.55, longitude: -46.63, location: { formatted_address: 'Rua A' }, distance }] }) } as Response;
  }

  it.each([[4999, 1], [5000, 1], [5001, 0]])('enforces the inclusive 5km boundary at %pm', async (distance, expected) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(providerResponse(distance));
    await expect(service.nearby(-23.55, -46.63, 9000)).resolves.toHaveLength(expected);
  });

  it('keeps the local venue authoritative when external id matches', async () => {
    venuesService.findAll.mockResolvedValue([{ id: 'local-1', name: 'Local', category: 'Bar', address: 'Rua', latitude: -23.55, longitude: -46.63, externalId: 'place-1' }]);
    jest.spyOn(global, 'fetch').mockResolvedValue(providerResponse(100, 'place-1'));
    const result = await service.nearby(-23.55, -46.63);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('LOCAL');
  });

  it.each([401, 403, 429, 500])('maps provider %s to a safe service error', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status, json: async () => ({ error: 'secret' }) } as Response);
    await expect(service.nearby(-23.55, -46.63)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps provider timeout to a safe service error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    await expect(service.nearby(-23.55, -46.63)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not expose the provider token in its response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(providerResponse(100));
    const result = await service.nearby(-23.55, -46.63);
    expect(JSON.stringify(result)).not.toContain('test-token');
  });

  it('uses top-level coordinates and does not treat location as geocodes', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [
      { fsq_place_id: 'top-level', name: 'Top level', latitude: -23.55, longitude: -46.63, location: { formatted_address: 'Rua A' }, distance: 1000 },
      { fsq_place_id: 'no-coordinates', name: 'No coordinates', location: { formatted_address: 'Rua B', latitude: -23.55, longitude: -46.63 }, distance: 1000 },
    ] }) } as Response);
    const result = await service.nearby(-23.55, -46.63);
    expect(result.map((place) => place.externalId)).toEqual(['top-level']);
    expect(request).toHaveBeenCalled();
  });

  it('uses the current endpoint, bearer header and normalized query parameters', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(providerResponse(100));
    await service.nearby(-23.55, -46.63);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://places-api.foursquare.com/places/search');
    expect(parsed.searchParams.get('ll')).toBe('-23.55,-46.63');
    expect(parsed.searchParams.get('radius')).toBe('5000');
    expect(parsed.searchParams.get('limit')).toBe('50');
    expect(parsed.searchParams.get('sort')).toBe('DISTANCE');
    expect(parsed.searchParams.get('fsq_category_ids')).toContain('4bf58dd8d48988d116941735');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect((options.headers as Record<string, string>)['X-Places-Api-Version']).toBe('2025-06-17');
  });
});
