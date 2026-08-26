import dotenv from 'dotenv';
import path from 'path';

// Load .env file from root or server directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://livedocs_user:livedocs_password@localhost:5432/livedocs_db?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'livedocs_super_secret_access_key_12345',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'livedocs_super_secret_refresh_key_67890',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  },
  isProd: process.env.NODE_ENV === 'production',
};
