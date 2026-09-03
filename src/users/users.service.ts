import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AvatarStorageService } from './avatar-storage.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly publicUserSelect = {
    id: true,
    name: true,
    email: true,
    username: true,
    city: true,
    phone: true,
    avatar: true,
    bio: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async findAll() {
    return this.prisma.user.findMany({
      select: this.publicUserSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: this.publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async findMe(id: string) {
    return this.findOne(id);
  }

  async updateMe(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const data: {
      name?: string;
      username?: string | null;
      city?: string | null;
      phone?: string | null;
      bio?: string | null;
      avatar?: string | null;
    } = {};

    if (updateUserDto.name !== undefined) {
      data.name = updateUserDto.name.trim();
    }

    if (updateUserDto.username !== undefined) {
      const username = (updateUserDto.username ?? '').trim().replace(/^@+/, '').toLowerCase();
      data.username = username.length > 0 ? username : null;
    }
    if (updateUserDto.city !== undefined) {
      const city = (updateUserDto.city ?? '').trim();
      if (!city) data.city = null;
      else {
        const match = city.match(/^(.+),\s*([A-Za-z]{2})$/);
        if (!match) throw new BadRequestException('Informe a cidade e a UF, por exemplo: Carapicuíba, SP.');
        data.city = `${match[1].trim()}, ${match[2].toUpperCase()}`;
      }
    }
    if (updateUserDto.phone !== undefined) {
      const raw = (updateUserDto.phone ?? '').trim();
      if (!raw) {
        data.phone = null;
      } else {
        const normalized = `${raw.startsWith('+') ? '+' : ''}${raw.replace(/\D/g, '')}`;
        const digitCount = normalized.replace('+', '').length;
        if (digitCount < 8 || digitCount > 20) throw new BadRequestException('Digite um telefone válido.');
        data.phone = normalized;
      }
    }

    if (updateUserDto.bio !== undefined) {
      const bio = (updateUserDto.bio ?? '').trim();

      data.bio = bio.length > 0 ? bio : null;
    }

    if (updateUserDto.avatar !== undefined) {
      data.avatar = (updateUserDto.avatar ?? '').trim() || null;
    }

    try {
      return await this.prisma.user.update({ where: { id }, data, select: this.publicUserSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este nome de usuário já está em uso.');
      }
      throw error;
    }
  }

  async updateAvatar(id: string, reference: string, storage: AvatarStorageService) {
    const current = await this.prisma.user.findUnique({ where: { id }, select: { avatar: true } });
    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatar: reference },
      select: this.publicUserSelect,
    });
    await storage.removeIfLocal(current?.avatar);
    return updated;
  }
}
