import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { SendDirectMessageDto } from './dto/send-direct-message.dto';

@Injectable()
export class DirectMessagesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async ensureUserExists(
    userId: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
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
      throw new NotFoundException(
        'Usuário não encontrado.',
      );
    }

    return user;
  }

  private async ensureConversationUsers(
    senderId: string,
    receiverId: string,
  ) {
    if (
      senderId === receiverId
    ) {
      throw new NotFoundException(
        'Não é possível enviar mensagem para você mesmo.',
      );
    }

    await this.ensureUserExists(
      senderId,
    );

    await this.ensureUserExists(
      receiverId,
    );
  }

  async create(
    senderId: string,
    receiverId: string,
    dto: SendDirectMessageDto,
  ) {
    await this.ensureConversationUsers(
      senderId,
      receiverId,
    );

    const text =
      dto.text.trim();

    if (!text) {
      throw new NotFoundException(
        'A mensagem não pode estar vazia.',
      );
    }

    if (
      text.length > 2000
    ) {
      throw new NotFoundException(
        'A mensagem não pode ter mais de 2000 caracteres.',
      );
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

  async findConversation(
    userId: string,
    otherUserId: string,
  ) {
    await this.ensureConversationUsers(
      userId,
      otherUserId,
    );

    return this.prisma.directMessage.findMany({
      where: {
        OR: [
          {
            senderId: userId,
            receiverId:
              otherUserId,
          },

          {
            senderId:
              otherUserId,
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
}