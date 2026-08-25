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

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        bio: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async createDirectMessage(
    senderId: string,
    receiverId: string,
    dto: CreateMessageDto,
  ) {
    if (!receiverId?.trim()) {
      throw new NotFoundException('receiverId é obrigatório.');
    }

    if (senderId === receiverId) {
      throw new NotFoundException(
        'Não é possível enviar mensagem para si mesmo.',
      );
    }

    await this.ensureUser(senderId);

    await this.ensureUser(receiverId);

    const text = dto.text.trim();

    if (!text) {
      throw new NotFoundException('A mensagem não pode estar vazia.');
    }

    return this.prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        text,
      },

      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },

        receiver: {
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

  async findDirectMessages(userId: string, otherUserId: string) {
    if (!otherUserId?.trim()) {
      throw new NotFoundException('Usuário da conversa é obrigatório.');
    }

    if (userId === otherUserId) {
      throw new NotFoundException(
        'Uma conversa privada precisa ter dois usuários.',
      );
    }

    await this.ensureUser(userId);

    await this.ensureUser(otherUserId);

    return this.prisma.directMessage.findMany({
      where: {
        OR: [
          {
            senderId: userId,
            receiverId: otherUserId,
          },
          {
            senderId: otherUserId,
            receiverId: userId,
          },
        ],
      },

      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },

        receiver: {
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

  async findDirectConversations(userId: string) {
    await this.ensureUser(userId);

    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          {
            senderId: userId,
          },
          {
            receiverId: userId,
          },
        ],
      },

      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },

        receiver: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    const conversations = new Map<string, (typeof messages)[number]>();

    for (const message of messages) {
      const otherUserId =
        message.senderId === userId ? message.receiverId : message.senderId;

      if (!conversations.has(otherUserId)) {
        conversations.set(otherUserId, message);
      }
    }

    return Array.from(conversations.values());
  }
}
