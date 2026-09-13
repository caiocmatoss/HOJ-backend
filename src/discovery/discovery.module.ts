import { Module } from '@nestjs/common';
import { VenuesModule } from '../venues/venues.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

@Module({ imports: [VenuesModule], controllers: [DiscoveryController], providers: [DiscoveryService] })
export class DiscoveryModule {}
