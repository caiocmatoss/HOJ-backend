import { Body, Controller, UnauthorizedException, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { Throttle } from '@nestjs/throttler';
import { securityConfig } from '../config/security-config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register') @Throttle({ default: { limit: securityConfig.register.limit, ttl: securityConfig.register.ttlSeconds * 1000 } }) register(@Body() dto: RegisterDto) { return this.authService.register(dto); }
  @Post('login') @Throttle({ default: { limit: securityConfig.login.limit, ttl: securityConfig.login.ttlSeconds * 1000 } }) login(@Body() dto: LoginDto) { return this.authService.login(dto); }
  @Post('forgot-password') @Throttle({ default: { limit: securityConfig.forgot.limit, ttl: securityConfig.forgot.ttlSeconds * 1000 } }) @HttpCode(HttpStatus.ACCEPTED) forgotPassword(@Body() dto: ForgotPasswordDto) { return this.authService.forgotPassword(dto.email); }
  @Post('reset-password') @Throttle({ default: { limit: securityConfig.reset.limit, ttl: securityConfig.reset.ttlSeconds * 1000 } }) @HttpCode(HttpStatus.NO_CONTENT) async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> { await this.authService.resetPassword(dto.token, dto.newPassword); }
  @Post('email-verification/request') @Throttle({ default: { limit: securityConfig.verificationRequest.limit, ttl: securityConfig.verificationRequest.ttlSeconds * 1000 } }) @UseGuards(JwtAuthGuard) requestEmailVerification(@Req() request: Request) { return this.authService.requestEmailVerification((request.user as { id?: string }).id ?? (() => { throw new UnauthorizedException('Usuário não autenticado.'); })()); }
  @Post('email-verification/confirm') @Throttle({ default: { limit: securityConfig.verificationConfirm.limit, ttl: securityConfig.verificationConfirm.ttlSeconds * 1000 } }) @HttpCode(HttpStatus.NO_CONTENT) async confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto): Promise<void> { await this.authService.confirmEmailVerification(dto.token); }
  @Post('refresh') @Throttle({ default: { limit: securityConfig.refresh.limit, ttl: securityConfig.refresh.ttlSeconds * 1000 } }) refresh(@Body() dto: RefreshTokenDto) { return this.authService.refresh(dto.refreshToken); }
  @Post('logout') @HttpCode(HttpStatus.NO_CONTENT) async logout(@Body() dto: RefreshTokenDto): Promise<void> { await this.authService.logout(dto.refreshToken); }
  @Post('logout-all') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.NO_CONTENT) async logoutAll(@Req() request: Request): Promise<void> {
    const user = request.user as { sub?: string };
    if (user?.sub) await this.authService.logoutAll(user.sub);
  }
  @Get('me') @UseGuards(JwtAuthGuard) getMe(@Req() request: Request) { return request.user; }
}