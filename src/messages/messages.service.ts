import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMember(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado.');
    }

    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Você não é membro deste grupo.');
    }

    return member;
  }

  async create(userId: string, groupId: string, dto: CreateMessageDto) {
    await this.ensureMember(userId, groupId);

    const text = dto.text.trim();

    if (!text) {
      throw new NotFoundException('A mensagem não pode estar vazia.');
    }

    return this.prisma.message.create({
      data: {
        groupId,
        userId,
        text,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });
  }

  async findAll(userId: string, groupId: string) {
    await this.ensureMember(userId, groupId);

    return this.prisma.message.findMany({
      where: {
        groupId,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
