import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { DocumentRole } from '@livedocs/shared';
import { yjsManager } from '../socket/yjs.manager';

const router = Router();

// Helper to determine effective user role on a document
export async function getDocumentRole(
  documentId: string,
  userId?: string
): Promise<{ doc: any; role: DocumentRole | null }> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      owner: { select: { id: true, email: true, name: true, avatarColor: true } },
      permissions: {
        include: {
          user: { select: { id: true, email: true, name: true, avatarColor: true } },
        },
      },
    },
  });

  if (!doc) {
    return { doc: null, role: null };
  }

  if (userId) {
    if (doc.ownerId === userId) {
      return { doc, role: 'OWNER' };
    }

    const perm = doc.permissions.find((p: any) => p.userId === userId);
    if (perm) {
      return { doc, role: perm.role as DocumentRole };
    }
  }

  if (doc.isPublic) {
    return { doc, role: doc.defaultRole as DocumentRole };
  }

  return { doc, role: null };
}

// GET /api/documents - List paginated documents
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || '12', 10)));
    const search = ((req.query.search as string) || '').trim();
    const filter = (req.query.filter as string) || 'all'; // 'all' | 'owned' | 'shared'

    const searchCondition = search
      ? {
          title: {
            contains: search,
          },
        }
      : {};

    let whereClause: any = {};

    if (filter === 'owned') {
      whereClause = {
        ownerId: userId,
        ...searchCondition,
      };
    } else if (filter === 'shared') {
      whereClause = {
        permissions: {
          some: { userId },
        },
        ownerId: { not: userId },
        ...searchCondition,
      };
    } else {
      // 'all': owned by user OR explicitly shared with user
      whereClause = {
        OR: [
          { ownerId: userId },
          {
            permissions: {
              some: { userId },
            },
          },
        ],
        ...searchCondition,
      };
    }

    const [total, documents] = await Promise.all([
      prisma.document.count({ where: whereClause }),
      prisma.document.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          contentPreview: true,
          ownerId: true,
          owner: {
            select: { id: true, email: true, name: true, avatarColor: true },
          },
          isPublic: true,
          defaultRole: true,
          createdAt: true,
          updatedAt: true,
          permissions: {
            where: { userId },
            select: { role: true },
          },
        },
      }),
    ]);

    const formattedDocs = documents.map((doc: any) => {
      let role: DocumentRole = 'VIEWER';
      if (doc.ownerId === userId) {
        role = 'OWNER';
      } else if (doc.permissions.length > 0) {
        role = doc.permissions[0].role as DocumentRole;
      } else if (doc.isPublic) {
        role = doc.defaultRole as DocumentRole;
      }

      return {
        id: doc.id,
        title: doc.title,
        contentPreview: doc.contentPreview,
        ownerId: doc.ownerId,
        owner: doc.owner,
        userRole: role,
        isPublic: doc.isPublic,
        defaultRole: doc.defaultRole as DocumentRole,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      };
    });

    res.json({
      data: formattedDocs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Internal server error loading documents.' });
  }
});

// POST /api/documents - Create a new document
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const title = (req.body.title || 'Untitled Document').trim();

    const newDoc = await prisma.document.create({
      data: {
        title,
        ownerId: userId,
      },
      include: {
        owner: {
          select: { id: true, email: true, name: true, avatarColor: true },
        },
      },
    });

    // Create initial snapshot
    await prisma.documentSnapshot.create({
      data: {
        documentId: newDoc.id,
        binaryState: Buffer.from([]),
        title: 'Initial Document Created',
        comment: 'Automatic initial snapshot',
        createdById: userId,
      },
    });

    res.status(201).json({
      id: newDoc.id,
      title: newDoc.title,
      contentPreview: null,
      ownerId: newDoc.ownerId,
      owner: newDoc.owner,
      userRole: 'OWNER' as DocumentRole,
      isPublic: newDoc.isPublic,
      defaultRole: newDoc.defaultRole as DocumentRole,
      createdAt: newDoc.createdAt.toISOString(),
      updatedAt: newDoc.updatedAt.toISOString(),
      permissions: [],
    });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Failed to create document.' });
  }
});

// GET /api/documents/:id - Get document metadata & details
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { doc, role } = await getDocumentRole(id, userId);

    if (!doc || !role) {
      res.status(404).json({ error: 'Document not found or access denied.' });
      return;
    }

    const responseData = {
      id: doc.id,
      title: doc.title,
      contentPreview: doc.contentPreview,
      ownerId: doc.ownerId,
      owner: doc.owner,
      userRole: role,
      isPublic: doc.isPublic,
      defaultRole: doc.defaultRole as DocumentRole,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      permissions: doc.permissions.map((p: any) => ({
        id: p.id,
        userId: p.userId,
        user: p.user,
        role: p.role as DocumentRole,
        createdAt: p.createdAt.toISOString(),
      })),
    };

    res.json(responseData);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/documents/:id - Update document settings or title
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { doc, role } = await getDocumentRole(id, userId);
    if (!doc || !role) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (role === 'VIEWER') {
      res.status(403).json({ error: 'Viewers cannot modify document properties.' });
      return;
    }

    const updateData: any = {};

    if (req.body.title !== undefined) {
      updateData.title = String(req.body.title).trim() || 'Untitled Document';
    }

    // Only owner can change public visibility and default role
    if (role === 'OWNER') {
      if (req.body.isPublic !== undefined) {
        updateData.isPublic = Boolean(req.body.isPublic);
      }
      if (req.body.defaultRole !== undefined) {
        if (['EDITOR', 'VIEWER'].includes(req.body.defaultRole)) {
          updateData.defaultRole = req.body.defaultRole;
        }
      }
    }

    const updated = await prisma.document.update({
      where: { id },
      data: updateData,
    });

    res.json({
      id: updated.id,
      title: updated.title,
      isPublic: updated.isPublic,
      defaultRole: updated.defaultRole,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document.' });
  }
});

// DELETE /api/documents/:id - Delete document (Owner only)
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (doc.ownerId !== userId) {
      res.status(403).json({ error: 'Only the document owner can delete this document.' });
      return;
    }

    await prisma.document.delete({ where: { id } });
    yjsManager.cleanupDoc(id);

    res.json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// POST /api/documents/:id/share - Invite or update collaborator role (Owner only)
const shareSchema = z.object({
  email: z.string().email(),
  role: z.enum(['EDITOR', 'VIEWER']),
});

router.post('/:id/share', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (doc.ownerId !== userId) {
      res.status(403).json({ error: 'Only the owner can manage permissions.' });
      return;
    }

    const parseResult = shareSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { email, role } = parseResult.data;
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, avatarColor: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: `User with email "${email}" not found. Ask them to sign up first.` });
      return;
    }

    if (targetUser.id === userId) {
      res.status(400).json({ error: 'You are already the owner of this document.' });
      return;
    }

    const permission = await prisma.documentPermission.upsert({
      where: {
        userId_documentId: {
          userId: targetUser.id,
          documentId: id,
        },
      },
      update: { role },
      create: {
        userId: targetUser.id,
        documentId: id,
        role,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarColor: true },
        },
      },
    });

    // Notify connected sockets to refresh permissions
    yjsManager.broadcastPermissionChange(id);

    res.json({
      id: permission.id,
      userId: permission.userId,
      user: permission.user,
      role: permission.role as DocumentRole,
      createdAt: permission.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Share document error:', error);
    res.status(500).json({ error: 'Failed to share document.' });
  }
});

// DELETE /api/documents/:id/share/:userId - Revoke collaborator access (Owner only)
router.delete('/:id/share/:targetUserId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, targetUserId } = req.params;
    const userId = req.user!.id;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!doc || doc.ownerId !== userId) {
      res.status(403).json({ error: 'Only the owner can remove collaborators.' });
      return;
    }

    await prisma.documentPermission.deleteMany({
      where: {
        documentId: id,
        userId: targetUserId,
      },
    });

    yjsManager.broadcastPermissionChange(id);

    res.json({ message: 'Permission revoked.' });
  } catch (error) {
    console.error('Revoke permission error:', error);
    res.status(500).json({ error: 'Failed to revoke permission.' });
  }
});

// GET /api/documents/:id/snapshots - List version history snapshots
router.get('/:id/snapshots', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { role } = await getDocumentRole(id, userId);
    if (!role) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const snapshots = await prisma.documentSnapshot.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentId: true,
        title: true,
        comment: true,
        createdAt: true,
        createdById: true,
        createdBy: {
          select: { id: true, email: true, name: true, avatarColor: true },
        },
      },
    });

    res.json(
      snapshots.map((s: any) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('List snapshots error:', error);
    res.status(500).json({ error: 'Failed to fetch version history.' });
  }
});

// POST /api/documents/:id/snapshots - Create manual snapshot point
router.post('/:id/snapshots', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { role } = await getDocumentRole(id, userId);
    if (!role || role === 'VIEWER') {
      res.status(403).json({ error: 'Only owners and editors can create snapshot versions.' });
      return;
    }

    const title = (req.body.title || 'Saved Version').trim();
    const comment = req.body.comment ? String(req.body.comment).trim() : null;

    const snapshot = await yjsManager.createSnapshot(id, userId, title, comment);

    res.status(201).json({
      id: snapshot.id,
      documentId: snapshot.documentId,
      title: snapshot.title,
      comment: snapshot.comment,
      createdById: snapshot.createdById,
      createdAt: snapshot.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Create snapshot error:', error);
    res.status(500).json({ error: 'Failed to create snapshot.' });
  }
});

// GET /api/documents/:id/snapshots/:snapshotId - Get snapshot binary state for preview
router.get('/:id/snapshots/:snapshotId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, snapshotId } = req.params;
    const userId = req.user!.id;

    const { role } = await getDocumentRole(id, userId);
    if (!role) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const snapshot = await prisma.documentSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        createdBy: {
          select: { id: true, email: true, name: true, avatarColor: true },
        },
      },
    });

    if (!snapshot || snapshot.documentId !== id) {
      res.status(404).json({ error: 'Snapshot not found.' });
      return;
    }

    res.json({
      id: snapshot.id,
      documentId: snapshot.documentId,
      title: snapshot.title,
      comment: snapshot.comment,
      createdById: snapshot.createdById,
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt.toISOString(),
      binaryStateBase64: snapshot.binaryState.toString('base64'),
    });
  } catch (error) {
    console.error('Get snapshot error:', error);
    res.status(500).json({ error: 'Failed to retrieve snapshot.' });
  }
});

// POST /api/documents/:id/snapshots/:snapshotId/restore - Restore document to snapshot
router.post('/:id/snapshots/:snapshotId/restore', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, snapshotId } = req.params;
    const userId = req.user!.id;

    const { role } = await getDocumentRole(id, userId);
    if (!role || role === 'VIEWER') {
      res.status(403).json({ error: 'Viewers cannot restore versions.' });
      return;
    }

    const snapshot = await prisma.documentSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot || snapshot.documentId !== id) {
      res.status(404).json({ error: 'Snapshot not found.' });
      return;
    }

    // Restore state in memory and database, then broadcast to all connected sockets
    await yjsManager.restoreSnapshot(id, snapshot.binaryState, userId);

    res.json({ message: 'Version restored successfully.' });
  } catch (error) {
    console.error('Restore snapshot error:', error);
    res.status(500).json({ error: 'Failed to restore snapshot.' });
  }
});

export default router;
