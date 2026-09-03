import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrivacyService } from './privacy.service';
import { UpdatePrivacyPreferencesDto } from './dto/update-privacy-preferences.dto';

@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}
  @Get('preferences') getPreferences(@Req() request: Request & { user: { id: string } }) { return this.privacyService.getPreferences(request.user.id); }
  @Patch('preferences') updatePreferences(@Req() request: Request & { user: { id: string } }, @Body() dto: UpdatePrivacyPreferencesDto) { return this.privacyService.updatePreferences(request.user.id, dto); }
}
