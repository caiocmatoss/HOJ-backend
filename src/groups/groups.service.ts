import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGroupDto) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id: dto.venueId,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    return this.prisma.group.create({
      data: {
        name: dto.name,
        venueId: dto.venueId,
        creatorId: userId,

        members: {
          create: {
            userId,
          },
        },
      },

      include: {
        venue: true,

        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },

        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },

      include: {
        venue: true,

        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },

        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },

      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(userId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,

        members: {
          some: {
            userId,
          },
        },
      },

      include: {
        venue: true,

        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },

        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado.');
    }

    return group;
  }

  async addMember(
    requesterId: string,
    groupId: string,
    dto: AddGroupMemberDto,
  ) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,

        members: {
          some: {
            userId: requesterId,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado ou você não é membro.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: dto.userId,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const existingMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: dto.userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('Usuário já é membro deste grupo.');
    }

    return this.prisma.groupMember.create({
      data: {
        groupId,
        userId: dto.userId,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
          },
        },
      },
    });
  }

  async findMembers(requesterId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,

        members: {
          some: {
            userId: requesterId,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado ou você não é membro.');
    }

    return this.prisma.groupMember.findMany({
      where: {
        groupId,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
          },
        },
      },

      orderBy: {
        joinedAt: 'asc',
      },
    });
  }

  async removeMember(requesterId: string, groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado.');
    }

    if (group.creatorId !== requesterId) {
      throw new ConflictException('Somente o criador pode remover membros.');
    }

    if (group.creatorId === userId) {
      throw new ConflictException('O criador não pode ser removido do grupo.');
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
      throw new NotFoundException('Usuário não é membro deste grupo.');
    }

    await this.prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    return {
      message: 'Membro removido do grupo.',
    };
  }
}
