import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';

const redisOptions: RedisOptions = {
  retryStrategy: (times) => {
    // Exponential backoff with a ceiling of 3 seconds
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
};

/**
 * We instantiate dedicated pub/sub clients for the @socket.io/redis-adapter
 * as well as a general-purpose client for fast caching if needed.
 * 
 * Architectural Note: Redis adapter enables horizontal scaling across multiple
 * server nodes behind a load balancer by broadcasting Socket.io room events
 * across instances via Redis PUB/SUB channels.
 */
export const pubClient = new Redis(config.redisUrl, redisOptions);
export const subClient = pubClient.duplicate();
export const redisClient = pubClient.duplicate();

let hasLoggedRedisWarning = false;

pubClient.on('error', (err) => {
  if (!hasLoggedRedisWarning) {
    console.warn('⚠️ [Redis]: Could not connect to Redis at ' + config.redisUrl + '. Ensure Redis is started via `docker compose up -d`. Socket.io will operate in local single-node mode until Redis is connected.');
    hasLoggedRedisWarning = true;
  }
});

subClient.on('error', () => {});
redisClient.on('error', () => {});

pubClient.on('connect', () => console.log('✅ Connected to Redis (Pub)'));
subClient.on('connect', () => console.log('✅ Connected to Redis (Sub)'));
redisClient.on('connect', () => console.log('✅ Connected to Redis (General)'));
