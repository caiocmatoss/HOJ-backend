import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshTokenTtlDays,
  refreshTokenExpiry,
} from './auth-session';

const PUBLIC_USER_SELECT = {
  id: true, name: true, email: true, username: true, city: true, phone: true,
  avatar: true, bio: true, status: true, role: true, createdAt: true, updatedAt: true,
} as const;

type PublicUser = { id: string; name: string; email: string; username: string | null; city: string | null; phone: string | null; avatar: string | null; bio: string | null; status: string; role: 'USER' | 'ADMIN'; createdAt: Date; updatedAt: Date };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new UnauthorizedException('Email ou senha inválidos.');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({ data: { name: dto.name, email: dto.email, passwordHash, avatar: dto.avatar, bio: dto.bio }, select: PUBLIC_USER_SELECT });
    const tokens = await this.createSession(user);
    return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Email ou senha inválidos.');
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Email ou senha inválidos.');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ONLINE' }, select: PUBLIC_USER_SELECT });
    const tokens = await this.createSession(updated);
    return { user: tokens.user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token inválido.');
    const hash = hashRefreshToken(refreshToken);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date();
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const stored = await tx.authRefreshToken.findUnique({ where: { tokenHash: hash }, include: { session: true } });
          if (!stored) throw new UnauthorizedException('Refresh token inválido.');
          if (stored.revokedAt) {
            await tx.authSession.updateMany({ where: { id: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
            await tx.authRefreshToken.updateMany({ where: { sessionId: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
            return { reuseDetected: true as const };
          }
          if (stored.expiresAt <= now || stored.session.expiresAt <= now || stored.session.revokedAt) throw new UnauthorizedException('Refresh token inválido.');
          const user = await tx.user.findUnique({ where: { id: stored.session.userId }, select: PUBLIC_USER_SELECT });
          if (!user) throw new UnauthorizedException('Refresh token inválido.');
          const nextPlain = generateRefreshToken();
          const next = await tx.authRefreshToken.create({ data: { sessionId: stored.sessionId, tokenHash: hashRefreshToken(nextPlain), expiresAt: stored.session.expiresAt } });
          const revoked = await tx.authRefreshToken.updateMany({ where: { id: stored.id, revokedAt: null }, data: { revokedAt: now, replacedByTokenId: next.id } });
          if (revoked.count !== 1) {
            await tx.authSession.updateMany({ where: { id: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
            await tx.authRefreshToken.updateMany({ where: { sessionId: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
            return { reuseDetected: true as const };
          }
          return { accessToken: await this.createAccessToken(user.id, user.email, user.role), refreshToken: nextPlain };
        }, { isolationLevel: 'Serializable' });
        if ('reuseDetected' in result) throw new UnauthorizedException('Refresh token inválido.');
        return result;
      } catch (error) {
        if (error instanceof UnauthorizedException || !this.isTransientTransactionError(error) || attempt === 2) throw error;
      }
    }
    throw new UnauthorizedException('Refresh token inválido.');
  }

  private isTransientTransactionError(error: unknown): boolean {
    const candidate = error as { code?: string; originalCode?: string; message?: string };
    return candidate.code === 'P2034' || candidate.originalCode === '40001' || candidate.message?.includes('TransactionWriteConflict') === true;
  }
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const hash = hashRefreshToken(refreshToken);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const stored = await tx.authRefreshToken.findUnique({ where: { tokenHash: hash } });
      if (!stored) return;
      await tx.authSession.updateMany({ where: { id: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
      await tx.authRefreshToken.updateMany({ where: { sessionId: stored.sessionId, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.authSession.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
      if (sessions.length === 0) return;
      const ids = sessions.map((session) => session.id);
      await tx.authSession.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
      await tx.authRefreshToken.updateMany({ where: { sessionId: { in: ids }, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  async getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
  }

  private async createSession(user: PublicUser) {
    const now = new Date();
    const expiresAt = refreshTokenExpiry(now, parseRefreshTokenTtlDays());
    const plain = generateRefreshToken();
    const session = await this.prisma.authSession.create({ data: { userId: user.id, expiresAt, refreshTokens: { create: { tokenHash: hashRefreshToken(plain), expiresAt } } } });
    void session;
    return { user, accessToken: await this.createAccessToken(user.id, user.email, user.role), refreshToken: plain };
  }

  private createAccessToken(userId: string, email: string, role?: 'USER' | 'ADMIN') {
    return this.jwtService.signAsync({ sub: userId, email, ...(role ? { role } : {}) });
  }
}