import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: registerDto.email,
      },
    });

    if (existingUser) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: registerDto.name,
        email: registerDto.email,
        passwordHash,
        avatar: registerDto.avatar,
        bio: registerDto.bio,
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        city: true,
        phone: true,
        avatar: true,
        bio: true,
        status: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const accessToken = await this.createAccessToken(user.id, user.email);

    return {
      user,
      accessToken,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: loginDto.email,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        status: 'ONLINE',
      },
    });

    const accessToken = await this.createAccessToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        city: user.city,
        phone: user.phone,
        avatar: user.avatar,
        bio: user.bio,
        status: 'ONLINE',
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
    };
  }

  private async createAccessToken(userId: string, email: string) {
    return this.jwtService.signAsync({
      sub: userId,
      email,
    });
  }
}
