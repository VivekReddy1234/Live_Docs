import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { io, Socket } from 'socket.io-client';
import { IndexeddbPersistence } from 'y-indexeddb';
import { SocketEvents, DocumentRole, PresenceUser } from '@livedocs/shared';
import { getAccessToken } from './api';

export type SyncStatus = 'connecting' | 'connected' | 'offline' | 'reconnecting' | 'synced';

export class LiveDocsSocketProvider {
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness;
  public socket: Socket | null = null;
  public indexeddbProvider: IndexeddbPersistence | null = null;
  public documentId: string;
  public role: DocumentRole = 'VIEWER';
  public isSynced: boolean = false;
  public status: SyncStatus = 'connecting';

  public user: PresenceUser;
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private roleListeners: Set<(role: DocumentRole) => void> = new Set();
  private destroyed: boolean = false;

  constructor(documentId: string, ydoc: Y.Doc, user: PresenceUser) {
    this.documentId = documentId;
    this.doc = ydoc;
    this.user = user;
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    // 1. Setup IndexedDB persistence for offline-first resilience
    this.indexeddbProvider = new IndexeddbPersistence(`livedocs-doc-${documentId}`, ydoc);
    this.indexeddbProvider.on('synced', () => {
      console.log(`[IndexedDB] Local offline cache loaded for doc ${documentId}`);
    });

    // 2. Setup Awareness initial state
    this.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: user.color,
      email: user.email,
    });

    // 3. Connect to real-time WebSocket transport
    this.connect();
    this.setupYjsListeners();
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  public onStatus(fn: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  public onRole(fn: (role: DocumentRole) => void): () => void {
    this.roleListeners.add(fn);
    fn(this.role);
    return () => this.roleListeners.delete(fn);
  }

  private connect() {
    const token = getAccessToken();

    this.socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setStatus('connecting');

    this.socket.on('connect', () => {
      this.setStatus('connected');
      console.log('[Socket] Connected to LiveDocs server');

      // Join Document Room
      this.socket?.emit(
        SocketEvents.JOIN_DOC,
        { documentId: this.documentId },
        (res: { success: boolean; role?: DocumentRole; error?: string }) => {
          if (res.success && res.role) {
            this.role = res.role;
            this.roleListeners.forEach((fn) => fn(this.role));
          }
        }
      );
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.setStatus('offline');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      this.setStatus('reconnecting');
    });

    // SERVER SYNC STEP 1: Server sends its vector
    this.socket.on(SocketEvents.DOC_SYNC_STEP1, (serverVectorBuffer: ArrayBuffer) => {
      if (this.destroyed) return;
      const serverVector = new Uint8Array(serverVectorBuffer);

      // Reply with missing updates that the server does not have
      const clientDiffUpdate = Y.encodeStateAsUpdate(this.doc, serverVector);
      if (clientDiffUpdate.length > 0) {
        this.socket?.emit(SocketEvents.DOC_SYNC_STEP2, clientDiffUpdate);
      }

      // Also request updates from server that the client does not have
      const clientVector = Y.encodeStateVector(this.doc);
      this.socket?.emit(SocketEvents.DOC_SYNC_STEP1, clientVector);
    });

    // SERVER SYNC STEP 2: Server sends missing updates for client
    this.socket.on(SocketEvents.DOC_SYNC_STEP2, (updateBuffer: ArrayBuffer) => {
      if (this.destroyed) return;
      try {
        const update = new Uint8Array(updateBuffer);
        Y.applyUpdate(this.doc, update, this);
        this.isSynced = true;
        this.setStatus('synced');
      } catch (err) {
        console.error('[Socket] Error applying sync step 2 update:', err);
      }
    });

    // LIVE BINARY UPDATE STREAM FROM PEERS
    this.socket.on(SocketEvents.DOC_UPDATE, (updateBuffer: ArrayBuffer) => {
      if (this.destroyed) return;
      try {
        const update = new Uint8Array(updateBuffer);
        Y.applyUpdate(this.doc, update, this);
      } catch (err) {
        console.error('[Socket] Error applying peer update:', err);
      }
    });

    // AWARENESS UPDATES (Cursors & Presence)
    this.socket.on(SocketEvents.AWARENESS_UPDATE, (awarenessBuffer: ArrayBuffer) => {
      if (this.destroyed) return;
      try {
        const update = new Uint8Array(awarenessBuffer);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
      } catch (err) {
        console.error('[Socket] Error applying awareness update:', err);
      }
    });

    // VERSION RESTORED EVENT
    this.socket.on(SocketEvents.DOC_RESTORED, (fullUpdateBuffer: ArrayBuffer) => {
      if (this.destroyed) return;
      try {
        const fullUpdate = new Uint8Array(fullUpdateBuffer);
        Y.applyUpdate(this.doc, fullUpdate, this);
        console.log('[Socket] Document state was restored to a snapshot version.');
      } catch (err) {
        console.error('[Socket] Error applying restored snapshot:', err);
      }
    });

    // PERMISSIONS CHANGED EVENT
    this.socket.on(SocketEvents.PERMISSIONS_UPDATED, () => {
      window.dispatchEvent(new CustomEvent('livedocs:permissions_updated', { detail: { documentId: this.documentId } }));
    });
  }

  private setupYjsListeners() {
    // 1. Listen for local document changes and broadcast binary update
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      // Ignore updates that originated from the socket (remote peers)
      if (origin === this) return;

      // Send raw binary Uint8Array over socket
      if (this.socket && this.socket.connected) {
        this.socket.emit(SocketEvents.DOC_UPDATE, update);
      }
    });

    // 2. Listen for local awareness changes (cursor movement, selection) and broadcast
    this.awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      if (origin === this) return;
      const changedClients = added.concat(updated).concat(removed);
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);

      if (this.socket && this.socket.connected) {
        this.socket.emit(SocketEvents.AWARENESS_UPDATE, update);
      }
    });
  }

  public destroy() {
    this.destroyed = true;
    this.awareness.destroy();
    this.indexeddbProvider?.destroy();
    if (this.socket) {
      this.socket.emit(SocketEvents.LEAVE_DOC);
      this.socket.disconnect();
    }
    this.statusListeners.clear();
    this.roleListeners.clear();
  }
}
