import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInviteDto } from './dto/create-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(senderId: string, groupId: string, dto: CreateInviteDto) {
    const receiverId = dto.receiverId;

    if (!receiverId) {
      throw new ConflictException('receiverId é obrigatório.');
    }

    if (senderId === receiverId) {
      throw new ConflictException('Você não pode convidar a si mesmo.');
    }

    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado.');
    }

    const senderMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: senderId,
        },
      },
    });

    if (!senderMember) {
      throw new ConflictException('Você não é membro deste grupo.');
    }

    const receiver = await this.prisma.user.findUnique({
      where: {
        id: receiverId,
      },
    });

    if (!receiver) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const receiverMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: receiverId,
        },
      },
    });

    if (receiverMember) {
      throw new ConflictException('Este usuário já é membro deste grupo.');
    }

    const existingInvite = await this.prisma.invite.findFirst({
      where: {
        groupId,
        receiverId,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      throw new ConflictException(
        'Já existe um convite pendente para este usuário.',
      );
    }

    const invite = await this.prisma.invite.create({
      data: {
        groupId,
        senderId,
        receiverId,
        status: 'PENDING',
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    await this.notificationsService.create(receiverId, {
      type: 'GROUP_INVITE',
      title: 'Novo convite para grupo',
      message: `${invite.sender.name} convidou você para o grupo ${invite.group.name}.`,
    });

    return invite;
  }

  async findReceived(userId: string) {
    return this.prisma.invite.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findSent(userId: string) {
    return this.prisma.invite.findMany({
      where: {
        senderId: userId,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async accept(userId: string, inviteId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: {
        id: inviteId,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado.');
    }

    if (invite.receiverId !== userId) {
      throw new ConflictException('Você não pode aceitar este convite.');
    }

    if (invite.status !== 'PENDING') {
      throw new ConflictException('Este convite já foi processado.');
    }

    const existingMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: invite.groupId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('Você já é membro deste grupo.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvite = await tx.invite.update({
        where: {
          id: inviteId,
        },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });

      const member = await tx.groupMember.create({
        data: {
          groupId: invite.groupId,
          userId,
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

      return {
        invite: updatedInvite,
        member,
      };
    });

    await this.notificationsService.create(invite.senderId, {
      type: 'GROUP_INVITE_ACCEPTED',
      title: 'Convite aceito',
      message: `${invite.receiver.name} entrou no grupo ${invite.group.name}.`,
    });

    return result;
  }

  async reject(userId: string, inviteId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: {
        id: inviteId,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado.');
    }

    if (invite.receiverId !== userId) {
      throw new ConflictException('Você não pode rejeitar este convite.');
    }

    if (invite.status !== 'PENDING') {
      throw new ConflictException('Este convite já foi processado.');
    }

    return this.prisma.invite.update({
      where: {
        id: inviteId,
      },
      data: {
        status: 'REJECTED',
        respondedAt: new Date(),
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            venueId: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
    });
  }
}
