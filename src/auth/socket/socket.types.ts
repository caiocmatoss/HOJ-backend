import type { Socket } from 'socket.io';

export type SocketUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  status: string;
};

export type SocketData = {
  user?: SocketUser;
  presenceRegistered?: boolean;
};

export type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;
