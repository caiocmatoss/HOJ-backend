import { UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../prisma/prisma.service';

import type { AppSocket } from './socket.types';

type JwtPayload = {
  sub: string;
  email: string;
};

export async function socketAuthMiddleware(
  socket: AppSocket,
  next: (err?: Error) => void,
  jwtService: JwtService,
  prisma: PrismaService,
): Promise<void> {
  try {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;

    const authToken = auth?.token;

    if (typeof authToken !== 'string' || !authToken.trim()) {
      throw new UnauthorizedException('Token não informado.');
    }

    const token = authToken.startsWith('Bearer ')
      ? authToken.substring(7).trim()
      : authToken.trim();

    const payload = await jwtService.verifyAsync<JwtPayload>(token);

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new UnauthorizedException('Token inválido.');
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
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
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    socket.data.user = user;

    next();
  } catch {
    next(new Error('Não autorizado.'));
  }
}
