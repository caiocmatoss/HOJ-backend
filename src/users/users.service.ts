import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly publicUserSelect = {
    id: true,
    name: true,
    email: true,
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
      bio?: string | null;
      avatar?: string | null;
    } = {};

    if (updateUserDto.name !== undefined) {
      data.name = updateUserDto.name.trim();
    }

    if (updateUserDto.bio !== undefined) {
      const bio = updateUserDto.bio.trim();

      data.bio = bio.length > 0 ? bio : null;
    }

    if (updateUserDto.avatar !== undefined) {
      data.avatar = updateUserDto.avatar.trim();
    }

    return this.prisma.user.update({
      where: {
        id,
      },
      data,
      select: this.publicUserSelect,
    });
  }
}
