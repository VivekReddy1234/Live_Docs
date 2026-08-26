import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as Y from 'yjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting LiveDocs database seeding...');

  // 1. Clean existing data
  await prisma.documentSnapshot.deleteMany({});
  await prisma.documentPermission.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create demo users
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.create({
    data: {
      email: 'alice@livedocs.dev',
      name: 'Alice Johnson',
      passwordHash,
      avatarColor: '#3b82f6', // blue
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@livedocs.dev',
      name: 'Bob Smith',
      passwordHash,
      avatarColor: '#10b981', // emerald
    },
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@livedocs.dev',
      name: 'Charlie Davis',
      passwordHash,
      avatarColor: '#f97316', // orange
    },
  });

  console.log('👤 Created demo users: Alice (Owner), Bob (Editor), Charlie (Viewer)');

  // 3. Create Sample Document with Initial Yjs State
  const sampleYDoc = new Y.Doc();
  const initialBinary = Buffer.from(Y.encodeStateAsUpdate(sampleYDoc));

  const doc1 = await prisma.document.create({
    data: {
      title: 'Welcome to LiveDocs — Production Collaborative Editor',
      contentPreview: 'LiveDocs is a high-performance, real-time collaborative document platform.',
      ownerId: alice.id,
      currentState: initialBinary,
      isPublic: true,
      defaultRole: 'VIEWER',
    },
  });

  // Share with Bob as EDITOR and Charlie as VIEWER
  await prisma.documentPermission.create({
    data: {
      userId: bob.id,
      documentId: doc1.id,
      role: 'EDITOR',
    },
  });

  await prisma.documentPermission.create({
    data: {
      userId: charlie.id,
      documentId: doc1.id,
      role: 'VIEWER',
    },
  });

  // Create initial snapshot
  await prisma.documentSnapshot.create({
    data: {
      documentId: doc1.id,
      binaryState: initialBinary,
      title: 'v1.0 - Initial Project Setup',
      comment: 'Initial template document created during database seed',
      createdById: alice.id,
    },
  });

  // Create another private document for Bob
  const doc2 = await prisma.document.create({
    data: {
      title: 'Architecture Spec & RFC: CRDT Offline Merging',
      contentPreview: 'Technical notes on conflict-free replicated data types and binary websocket sync.',
      ownerId: bob.id,
      currentState: initialBinary,
      isPublic: false,
      defaultRole: 'VIEWER',
    },
  });

  await prisma.documentSnapshot.create({
    data: {
      documentId: doc2.id,
      binaryState: initialBinary,
      title: 'Initial RFC Draft',
      comment: 'First draft by Bob',
      createdById: bob.id,
    },
  });

  console.log('📄 Created sample documents and permissions.');
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
