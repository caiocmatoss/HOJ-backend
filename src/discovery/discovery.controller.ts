import { Controller, Get, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { NearbyDiscoveryDto } from './dto/nearby-discovery.dto';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('nearby')
  nearby(@Query() query: NearbyDiscoveryDto) {
    return this.discoveryService.nearby(query.lat, query.lng, query.radius);
  }
}
