import * as Y from 'yjs';
import { Server } from 'socket.io';
import { prisma } from '../prisma/client';
import { SocketEvents } from '@livedocs/shared';

interface DocSession {
  doc: Y.Doc;
  lastSaved: number;
  updateCount: number;
  debounceTimer: NodeJS.Timeout | null;
  dirty: boolean;
  lastSnapshotTime: number;
}

class YjsManager {
  private docs: Map<string, DocSession> = new Map();
  private io: Server | null = null;
  private readonly DEBOUNCE_PERSIST_MS = 3000; // 3s debounce
  private readonly MAX_UPDATES_BEFORE_FORCE_PERSIST = 50;
  private readonly AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 min auto-snapshot

  public setIO(io: Server): void {
    this.io = io;
  }

  /**
   * Retrieves an in-memory Y.Doc for the document or loads its latest binary state
   * from PostgreSQL.
   */
  public async getOrCreateDoc(documentId: string): Promise<Y.Doc> {
    const existing = this.docs.get(documentId);
    if (existing) {
      return existing.doc;
    }

    const ydoc = new Y.Doc();

    // Fetch persisted binary state from database
    const dbDoc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { currentState: true },
    });

    if (dbDoc && dbDoc.currentState && dbDoc.currentState.length > 0) {
      try {
        Y.applyUpdate(ydoc, new Uint8Array(dbDoc.currentState));
      } catch (err) {
        console.error(`Failed to apply persisted Yjs state for document ${documentId}:`, err);
      }
    }

    const session: DocSession = {
      doc: ydoc,
      lastSaved: Date.now(),
      updateCount: 0,
      debounceTimer: null,
      dirty: false,
      lastSnapshotTime: Date.now(),
    };

    this.docs.set(documentId, session);
    return ydoc;
  }

  /**
   * Applies incoming client binary update, marks doc as dirty, and schedules debounced save.
   */
  public async applyUpdate(
    documentId: string,
    update: Uint8Array,
    userId?: string
  ): Promise<void> {
    const ydoc = await this.getOrCreateDoc(documentId);
    const session = this.docs.get(documentId);

    try {
      Y.applyUpdate(ydoc, update);
    } catch (error) {
      console.error(`Error applying update to doc ${documentId}:`, error);
      throw error;
    }

    if (session) {
      session.dirty = true;
      session.updateCount += 1;

      // If we crossed max unpersisted updates, flush immediately
      if (session.updateCount >= this.MAX_UPDATES_BEFORE_FORCE_PERSIST) {
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
          session.debounceTimer = null;
        }
        await this.persistDocState(documentId, userId);
      } else {
        // Otherwise reset debounce timer
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
        }
        session.debounceTimer = setTimeout(() => {
          this.persistDocState(documentId, userId).catch((err) =>
            console.error(`Debounced persist failed for doc ${documentId}:`, err)
          );
        }, this.DEBOUNCE_PERSIST_MS);
      }
    }
  }

  /**
   * Encodes state vector (Sync Step 1)
   */
  public async encodeStateVector(documentId: string): Promise<Uint8Array> {
    const ydoc = await this.getOrCreateDoc(documentId);
    return Y.encodeStateVector(ydoc);
  }

  /**
   * Encodes state as update (Sync Step 2 or full state)
   */
  public async encodeStateAsUpdate(
    documentId: string,
    targetStateVector?: Uint8Array
  ): Promise<Uint8Array> {
    const ydoc = await this.getOrCreateDoc(documentId);
    return Y.encodeStateAsUpdate(ydoc, targetStateVector);
  }

  /**
   * Extracts simple text preview from Tiptap XML fragment or text type
   */
  private extractPreviewText(ydoc: Y.Doc): string | null {
    try {
      const fragment = ydoc.getXmlFragment('default');
      let text = '';
      const traverse = (node: any) => {
        if (!node) return;
        if (node.toString) {
          text += ' ' + node.toString();
        }
      };
      traverse(fragment);
      const clean = text.replace(/<[^>]*>?/gm, '').trim();
      return clean.length > 0 ? clean.substring(0, 200) : null;
    } catch {
      return null;
    }
  }

  /**
   * Persists binary state vector to PostgreSQL Document record
   */
  public async persistDocState(documentId: string, userId?: string): Promise<void> {
    const session = this.docs.get(documentId);
    if (!session || !session.dirty) return;

    try {
      const fullUpdate = Y.encodeStateAsUpdate(session.doc);
      const preview = this.extractPreviewText(session.doc);

      await prisma.document.update({
        where: { id: documentId },
        data: {
          currentState: Buffer.from(fullUpdate),
          contentPreview: preview,
          updatedAt: new Date(),
        },
      });

      session.dirty = false;
      session.updateCount = 0;
      session.lastSaved = Date.now();

      // Check if auto-snapshot should be triggered
      const now = Date.now();
      if (now - session.lastSnapshotTime >= this.AUTO_SNAPSHOT_INTERVAL_MS) {
        session.lastSnapshotTime = now;
        if (userId) {
          await this.createSnapshot(
            documentId,
            userId,
            'Auto-save Snapshot',
            'Periodic auto-saved document checkpoint'
          ).catch((err) => console.error('Auto snapshot error:', err));
        }
      }
    } catch (error) {
      console.error(`Failed to persist document ${documentId}:`, error);
    }
  }

  /**
   * Creates a snapshot version record with full binary state
   */
  public async createSnapshot(
    documentId: string,
    userId: string,
    title: string = 'Saved Version',
    comment?: string | null
  ) {
    const ydoc = await this.getOrCreateDoc(documentId);
    const binaryState = Buffer.from(Y.encodeStateAsUpdate(ydoc));

    return prisma.documentSnapshot.create({
      data: {
        documentId,
        binaryState,
        title,
        comment,
        createdById: userId,
      },
    });
  }

  /**
   * Restores document to a given snapshot state and broadcasts to all room clients
   */
  public async restoreSnapshot(
    documentId: string,
    binaryState: Buffer,
    userId: string
  ): Promise<void> {
    // Create a new fresh Y.Doc with snapshot state
    const newDoc = new Y.Doc();
    Y.applyUpdate(newDoc, new Uint8Array(binaryState));

    // Update in-memory session
    let session = this.docs.get(documentId);
    if (session) {
      if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
        session.debounceTimer = null;
      }
      session.doc.destroy();
      session.doc = newDoc;
      session.dirty = false;
      session.updateCount = 0;
      session.lastSaved = Date.now();
    } else {
      session = {
        doc: newDoc,
        lastSaved: Date.now(),
        updateCount: 0,
        debounceTimer: null,
        dirty: false,
        lastSnapshotTime: Date.now(),
      };
      this.docs.set(documentId, session);
    }

    const preview = this.extractPreviewText(newDoc);

    // Save restored state to database
    await prisma.document.update({
      where: { id: documentId },
      data: {
        currentState: binaryState,
        contentPreview: preview,
        updatedAt: new Date(),
      },
    });

    // Create a snapshot noting the restore
    await prisma.documentSnapshot.create({
      data: {
        documentId,
        binaryState,
        title: `Restored Version checkpoint`,
        comment: `Document rolled back by user`,
        createdById: userId,
      },
    });

    // Broadcast full restore update to all connected sockets in room
    if (this.io) {
      const room = `doc:${documentId}`;
      const fullUpdate = Y.encodeStateAsUpdate(newDoc);
      this.io.to(room).emit(SocketEvents.DOC_RESTORED, Buffer.from(fullUpdate));
    }
  }

  /**
   * Notifies all clients in room that permissions were modified
   */
  public broadcastPermissionChange(documentId: string): void {
    if (this.io) {
      this.io.to(`doc:${documentId}`).emit(SocketEvents.PERMISSIONS_UPDATED, { documentId });
    }
  }

  /**
   * Cleans up in-memory doc if no clients are active or if deleted
   */
  public cleanupDoc(documentId: string): void {
    const session = this.docs.get(documentId);
    if (session) {
      if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
      }
      session.doc.destroy();
      this.docs.delete(documentId);
    }
  }

  /**
   * Flushes all dirty docs to database (for graceful server shutdown)
   */
  public async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];
    for (const [docId, session] of this.docs.entries()) {
      if (session.dirty) {
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
          session.debounceTimer = null;
        }
        flushPromises.push(this.persistDocState(docId));
      }
    }
    await Promise.all(flushPromises);
  }
}

export const yjsManager = new YjsManager();
