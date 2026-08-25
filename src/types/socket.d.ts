import type { SocketUser } from './socket-user';

declare module 'socket.io' {
  interface SocketData {
    user?: SocketUser;
    presenceRegistered?: boolean;
  }
}
