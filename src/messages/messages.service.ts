import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import type { Pagination, PaginatedResult } from '../common/pagination';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMember(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    const member = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!member) throw new NotFoundException('Você não é membro deste grupo.');
    return member;
  }

  private publicUser(user: any) {
    const pref = user?.privacyPreferences;
    if (!user) return user;
    const { privacyPreferences, ...rest } = user;
    return { ...rest, status: pref?.showStatus === false ? 'OFFLINE' : user.status, lastSeenAt: pref?.showLastSeen === false ? null : user.lastSeenAt };
  }

  async create(userId: string, groupId: string, dto: CreateMessageDto) {
    await this.ensureMember(userId, groupId);
    const text = dto.text.trim();
    if (!text) throw new NotFoundException('A mensagem não pode estar vazia.');
    return this.prisma.message.create({
      data: { groupId, userId, text },
      include: { user: { select: PUBLIC_USER_SELECT } },
    }).then((message: any) => ({ ...message, user: this.publicUser(message.user) }));
  }

  async findAll(userId: string, groupId: string, pagination: Pagination): Promise<PaginatedResult<any>>;
  async findAll(userId: string, groupId: string): Promise<any[]>;
  async findAll(userId: string, groupId: string, pagination?: Pagination) {
    await this.ensureMember(userId, groupId);
    const where = { groupId };
    const items = await this.prisma.message.findMany({
      where,
      ...(pagination ? { skip: pagination.skip, take: pagination.take } : {}),
      include: { user: { select: PUBLIC_USER_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const mapped = items.map((message: any) => ({ ...message, user: this.publicUser(message.user) }));
    if (!pagination) return mapped;
    const total = await this.prisma.message.count({ where });
    return { items: mapped, total };
  }
}