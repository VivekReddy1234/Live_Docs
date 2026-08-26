import { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../prisma/client';
import { UserSummary } from '@livedocs/shared';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: UserSummary;
    currentDocId?: string;
    role?: string;
  };
}

export async function socketAuthMiddleware(
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      // Allow guest socket connection for public documents; role will be verified upon joining
      return next();
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      // Invalid token, continue as guest
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, avatarColor: true },
    });

    if (user) {
      socket.data.user = user;
    }

    next();
  } catch (error) {
    console.error('Socket auth middleware error:', error);
    next();
  }
}
