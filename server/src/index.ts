import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import { setupSocketServer } from './socket';
import { prisma } from './prisma/client';
import { pubClient, subClient, redisClient } from './redis/client';
import { yjsManager } from './socket/yjs.manager';

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// Healthcheck Route
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbCheck = await prisma.$queryRaw`SELECT 1`.then(() => 'healthy').catch(() => 'unhealthy');
    const redisCheck = pubClient.status === 'ready' ? 'healthy' : pubClient.status;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbCheck,
      redis: redisCheck,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Setup Socket.io real-time server with Redis adapter
const io = setupSocketServer(server);

// Start server
server.listen(config.port, () => {
  console.log(`🚀 LiveDocs Server running on http://localhost:${config.port}`);
  console.log(`🌐 CORS enabled for: ${config.clientUrl}`);
});

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  // 1. Flush any pending dirty document state to database
  console.log('💾 Flushing active document states to PostgreSQL...');
  await yjsManager.flushAll().catch((err) => console.error('Error during document state flush:', err));

  // 2. Close Socket.io and HTTP server
  io.close(() => console.log('🔌 Socket.io connections closed'));
  server.close(() => console.log('🚪 HTTP server closed'));

  // 3. Disconnect Redis and Prisma
  await pubClient.quit().catch(() => {});
  await subClient.quit().catch(() => {});
  await redisClient.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});

  console.log('✅ Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
