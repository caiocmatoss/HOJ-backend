import { Test, TestingModule } from '@nestjs/testing';

import { VenuesService } from './venues.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VenuesService', () => {
  let service: VenuesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  it('serializes persisted catalog fields for imported venues', () => {
    const response = (service as any).serializeVenue({
      id: 'venue-1', name: 'Bar Do Zé Galinha', category: 'Bar', address: 'rua Joana Fabri Tomé, 202',
      latitude: -23.0095882, longitude: -46.9866371, occupancy: 0, capacity: null,
      source: 'IMPORTED', externalProvider: 'FSQ_OS', externalId: 'abc',
      locality: 'Vinhedo', region: 'SP', country: 'BR', postcode: '13280-000',
      phone: '(19) 0000-0000', website: 'https://example.com',
      sourceRefreshedAt: new Date('2023-09-13T00:00:00.000Z'), sourceClosedAt: null,
      description: null, image: null, rating: null, dj: null, promotion: null, playlist: null, status: 'OPEN', images: [],
    });
    expect(response).toMatchObject({ locality: 'Vinhedo', region: 'SP', country: 'BR', postcode: '13280-000', phone: '(19) 0000-0000', website: 'https://example.com', externalProvider: 'FSQ_OS', externalId: 'abc' });
    expect(response.sourceRefreshedAt).toEqual(new Date('2023-09-13T00:00:00.000Z'));
    expect(response.sourceClosedAt).toBeNull();
  });

  it('keeps absent catalog fields null for manual venues', () => {
    const response = (service as any).serializeVenue({
      id: 'venue-2', name: 'Manual', category: 'Bar', address: 'Rua', latitude: 1, longitude: 2,
      occupancy: 0, capacity: null, source: 'MANUAL', externalProvider: null, externalId: null,
      locality: null, region: null, country: null, postcode: null, phone: null, website: null,
      sourceRefreshedAt: null, sourceClosedAt: null, description: null, image: null, rating: null,
      dj: null, promotion: null, playlist: null, status: 'OPEN', images: [],
    });
    expect(response).toMatchObject({ locality: null, region: null, country: null, postcode: null, phone: null, website: null, sourceRefreshedAt: null, sourceClosedAt: null });
  });});
