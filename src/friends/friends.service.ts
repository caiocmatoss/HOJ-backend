import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new ConflictException(
        'Você não pode enviar uma solicitação para si mesmo.',
      );
    }

    const addressee = await this.prisma.user.findUnique({
      where: {
        id: addresseeId,
      },
    });

    if (!addressee) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          {
            requesterId,
            addresseeId,
          },
          {
            requesterId: addresseeId,
            addresseeId: requesterId,
          },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new ConflictException('Vocês já são amigos.');
      }

      if (existing.status === 'PENDING') {
        throw new ConflictException(
          'Já existe uma solicitação de amizade pendente.',
        );
      }

      /*
       * Se a solicitação anterior foi rejeitada,
       * permitimos uma nova solicitação.
       */
      if (existing.status === 'REJECTED') {
        const friendship = await this.prisma.friendship.update({
          where: {
            id: existing.id,
          },
          data: {
            requesterId,
            addresseeId,
            status: 'PENDING',
            createdAt: new Date(),
          },
          include: {
            requester: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
              },
            },
            addressee: {
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

        await this.notificationsService.create(addresseeId, {
          type: 'FRIEND_REQUEST',
          title: 'Nova solicitação de amizade',
          message: `${friendship.requester.name} enviou uma solicitação de amizade.`,
        });

        return friendship;
      }
    }

    const friendship = await this.prisma.friendship.create({
      data: {
        requesterId,
        addresseeId,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        addressee: {
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

    await this.notificationsService.create(addresseeId, {
      type: 'FRIEND_REQUEST',
      title: 'Nova solicitação de amizade',
      message: `${friendship.requester.name} enviou uma solicitação de amizade.`,
    });

    return friendship;
  }

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          {
            requesterId: userId,
          },
          {
            addresseeId: userId,
          },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
            privacyPreferences: { select: { showStatus: true } },
          },
        },
        addressee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
            privacyPreferences: { select: { showStatus: true } },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return friendships.map((friendship) => {
      const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      const { privacyPreferences, ...publicFriend } = friend;
      return { ...publicFriend, status: privacyPreferences?.showStatus === false ? 'OFFLINE' : friend.status };
    });
  }

  async getNearbyFriends(userId: string, radiusKm = 10) {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new BadRequestException(
        'radiusKm deve ser um número maior que zero.',
      );
    }

    const currentLocation = await this.prisma.userLocation.findUnique({
      where: {
        userId,
      },
    });

    if (!currentLocation) {
      return {
        radiusKm,
        count: 0,
        friends: [],
      };
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          {
            requesterId: userId,
          },
          {
            addresseeId: userId,
          },
        ],
      },
      select: {
        requesterId: true,
        addresseeId: true,
      },
    });

    const friendIds = friendships.map((friendship) =>
      friendship.requesterId === userId
        ? friendship.addresseeId
        : friendship.requesterId,
    );

    if (friendIds.length === 0) {
      return {
        radiusKm,
        count: 0,
        friends: [],
      };
    }

    const locations = await this.prisma.userLocation.findMany({
      where: {
        userId: {
          in: friendIds,
        },
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
            privacyPreferences: { select: { showStatus: true } },
          },
        },
      },
    });

    const latitude = Number(currentLocation.latitude);

    const longitude = Number(currentLocation.longitude);

    const toRadians = (value: number) => (value * Math.PI) / 180;

    const earthRadiusKm = 6371;

    const friends = locations
      .map((location) => {
        const friendLatitude = Number(location.latitude);

        const friendLongitude = Number(location.longitude);

        const latitudeDifference = toRadians(friendLatitude - latitude);

        const longitudeDifference = toRadians(friendLongitude - longitude);

        const a =
          Math.sin(latitudeDifference / 2) ** 2 +
          Math.cos(toRadians(latitude)) *
            Math.cos(toRadians(friendLatitude)) *
            Math.sin(longitudeDifference / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distanceKm = earthRadiusKm * c;

        return {
          id: location.user.id,
          name: location.user.name,
          email: location.user.email,
          avatar: location.user.avatar,
          bio: location.user.bio,
          status: location.user.privacyPreferences?.showStatus === false ? 'OFFLINE' : location.user.status,
          latitude: friendLatitude,
          longitude: friendLongitude,
          locationUpdatedAt: location.updatedAt,
          distanceMeters: Math.round(distanceKm * 1000),
          distanceKm: Math.round(distanceKm * 100) / 100,
        };
      })
      .filter((friend) => friend.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      radiusKm,
      count: friends.length,
      friends,
    };
  }

  async getRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: {
        addresseeId: userId,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
          },
        },
        addressee: {
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
        createdAt: 'desc',
      },
    });
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        id: friendshipId,
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        addressee: {
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

    if (!friendship) {
      throw new NotFoundException('Solicitação de amizade não encontrada.');
    }

    if (friendship.addresseeId !== userId) {
      throw new ConflictException('Você não pode aceitar esta solicitação.');
    }

    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Esta solicitação já foi processada.');
    }

    const updated = await this.prisma.friendship.update({
      where: {
        id: friendshipId,
      },
      data: {
        status: 'ACCEPTED',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        addressee: {
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

    await this.notificationsService.create(friendship.requesterId, {
      type: 'FRIEND_ACCEPTED',
      title: 'Solicitação aceita',
      message: `${friendship.addressee.name} aceitou sua solicitação de amizade.`,
    });

    return updated;
  }

  async rejectRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        id: friendshipId,
      },
    });

    if (!friendship) {
      throw new NotFoundException('Solicitação de amizade não encontrada.');
    }

    if (friendship.addresseeId !== userId) {
      throw new ConflictException('Você não pode rejeitar esta solicitação.');
    }

    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Esta solicitação já foi processada.');
    }

    return this.prisma.friendship.update({
      where: {
        id: friendshipId,
      },
      data: {
        status: 'REJECTED',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
        addressee: {
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

  async removeFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new ConflictException(
        'Você não pode remover a si mesmo da lista de amigos.',
      );
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          {
            requesterId: userId,
            addresseeId: friendId,
          },
          {
            requesterId: friendId,
            addresseeId: userId,
          },
        ],
      },
    });

    if (!friendship) {
      throw new NotFoundException('Amizade não encontrada.');
    }

    await this.prisma.friendship.delete({
      where: {
        id: friendship.id,
      },
    });

    return {
      message: 'Amizade removida com sucesso.',
    };
  }
}
