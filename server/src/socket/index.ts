import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from '../redis/client';
import { socketAuthMiddleware, AuthenticatedSocket } from './auth.middleware';
import { yjsManager } from './yjs.manager';
import { getDocumentRole } from '../routes/document.routes';
import { SocketEvents, DocumentRole } from '@livedocs/shared';
import { config } from '../config';

export function setupSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Binary transfer configuration
    maxHttpBufferSize: 1e8, // 100 MB max buffer for heavy updates
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Setup Redis Adapter for multi-server horizontal scaling
  try {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('⚡ Redis Adapter configured for Socket.io horizontal scaling');
  } catch (err: any) {
    console.warn('⚠️ Could not attach Redis adapter, falling back to in-memory adapter:', err.message);
  }

  // Authenticate socket handshakes
  io.use(socketAuthMiddleware as any);

  // Link YjsManager with IO instance for broadcasting
  yjsManager.setIO(io);

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const user = authSocket.data.user;

    // JOIN DOCUMENT ROOM
    socket.on(
      SocketEvents.JOIN_DOC,
      async (
        data: { documentId: string },
        callback?: (response: { success: boolean; role?: DocumentRole; error?: string }) => void
      ) => {
        try {
          const { documentId } = data;
          if (!documentId) {
            callback?.({ success: false, error: 'Document ID is required' });
            return;
          }

          const { doc, role } = await getDocumentRole(documentId, user?.id);

          if (!doc || !role) {
            socket.emit(SocketEvents.ERROR, { message: 'Access denied to document' });
            callback?.({ success: false, error: 'Access denied' });
            return;
          }

          const room = `doc:${documentId}`;
          await socket.join(room);

          authSocket.data.currentDocId = documentId;
          authSocket.data.role = role;

          // Step 1: Send server state vector to client so client can compute missing updates
          const serverVector = await yjsManager.encodeStateVector(documentId);
          socket.emit(SocketEvents.DOC_SYNC_STEP1, Buffer.from(serverVector));

          callback?.({ success: true, role });
        } catch (error) {
          console.error('Socket join error:', error);
          callback?.({ success: false, error: 'Failed to join document' });
        }
      }
    );

    // SYNC STEP 1 (Client sends vector -> Server replies with missing updates)
    socket.on(SocketEvents.DOC_SYNC_STEP1, async (clientVector: Buffer | Uint8Array) => {
      try {
        const documentId = authSocket.data.currentDocId;
        if (!documentId) return;

        const vectorUint8 = new Uint8Array(clientVector);
        const serverUpdate = await yjsManager.encodeStateAsUpdate(documentId, vectorUint8);

        if (serverUpdate.length > 0) {
          socket.emit(SocketEvents.DOC_SYNC_STEP2, Buffer.from(serverUpdate));
        }
      } catch (err) {
        console.error('Error handling Sync Step 1:', err);
      }
    });

    // SYNC STEP 2 (Client sends missing updates for server to apply)
    socket.on(SocketEvents.DOC_SYNC_STEP2, async (clientUpdate: Buffer | Uint8Array) => {
      try {
        const documentId = authSocket.data.currentDocId;
        const role = authSocket.data.role;
        if (!documentId) return;

        // Viewers are rejected from modifying server document state
        if (role === 'VIEWER') {
          return;
        }

        const updateUint8 = new Uint8Array(clientUpdate);
        await yjsManager.applyUpdate(documentId, updateUint8, user?.id);

        // Broadcast to all other peers in room
        const room = `doc:${documentId}`;
        socket.to(room).emit(SocketEvents.DOC_UPDATE, Buffer.from(updateUint8));
      } catch (err) {
        console.error('Error handling Sync Step 2:', err);
      }
    });

    // LIVE BINARY UPDATE STREAM
    socket.on(SocketEvents.DOC_UPDATE, async (update: Buffer | Uint8Array) => {
      try {
        const documentId = authSocket.data.currentDocId;
        const role = authSocket.data.role;

        if (!documentId) {
          return;
        }

        // Enforce Server-Side Role Permissions: Viewers cannot edit
        if (role === 'VIEWER') {
          socket.emit(SocketEvents.ERROR, {
            message: 'Permission denied: Read-only viewers cannot make edits.',
          });
          return;
        }

        const updateUint8 = new Uint8Array(update);

        // 1. Apply to server-side Y.Doc & schedule debounced database persist
        await yjsManager.applyUpdate(documentId, updateUint8, user?.id);

        // 2. Broadcast raw binary update to all other collaborators in the room
        const room = `doc:${documentId}`;
        socket.to(room).emit(SocketEvents.DOC_UPDATE, Buffer.from(updateUint8));
      } catch (error) {
        console.error('Error handling doc:update:', error);
      }
    });

    // AWARENESS & CURSOR PRESENCE RELAY
    socket.on(SocketEvents.AWARENESS_UPDATE, (awarenessData: Buffer | Uint8Array) => {
      const documentId = authSocket.data.currentDocId;
      if (!documentId) return;

      const room = `doc:${documentId}`;
      socket.to(room).emit(SocketEvents.AWARENESS_UPDATE, Buffer.from(awarenessData));
    });

    // LEAVE DOCUMENT ROOM
    socket.on(SocketEvents.LEAVE_DOC, () => {
      const documentId = authSocket.data.currentDocId;
      if (documentId) {
        socket.leave(`doc:${documentId}`);
        authSocket.data.currentDocId = undefined;
        authSocket.data.role = undefined;
      }
    });

    socket.on('disconnecting', () => {
      const documentId = authSocket.data.currentDocId;
      if (documentId) {
        socket.leave(`doc:${documentId}`);
      }
    });
  });

  return io;
}
