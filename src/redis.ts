import Redis from 'ioredis';

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;

if (isNaN(port) || port <= 0 || port > 65535) throw new Error(`Invalid REDIS_PORT: ${process.env.REDIS_PORT}`);

const redis = new Redis.default({ host, port });

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', err => console.error('Redis Error:', err));

export default redis;
