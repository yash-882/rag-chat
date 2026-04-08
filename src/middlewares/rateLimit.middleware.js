import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../configs/redis.config.js';

// Rate limiter
const createLimiter = (windowMs, limit, message) => {
  let limiter = null;

  return (req, res, next) => {
    if (!redisClient.isOpen) return next(); // Redis down — skip limiting

    if (!limiter) {
      limiter = rateLimit({
        windowMs,
        limit,
        message: { status: 'fail', message },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
      });
    }

    return limiter(req, res, next);
  };
};

// for AI endpoints (expensive)
export const aiRateLimit = createLimiter(
    60 * 1000,       // 1 minute window
    15,              // 15 requests per minute
    'Too many requests. Please slow down.'
);

// for upload endpoint
export const uploadRateLimit = createLimiter(
    60 * 1000,       // 1 minute window
    10,               // 10 uploads per minute
    'Too many upload attempts. Please wait.'
);