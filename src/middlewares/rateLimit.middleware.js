import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../configs/redis.config.js';

// Rate limiter
const createLimiter = (windowMs, max, message) => {
  if (redisClient.isOpen === true) {
    return rateLimit({
      windowMs,
      max,
      message: {
        status: 'fail',
        message
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      }),
    });
  }

  //. return a default limit until redis is connected
  return rateLimit({
    windowMs,
    max,
    message: {
      status: 'fail',
      message
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// for AI endpoints (expensive)
export const aiRateLimit = createLimiter(
  60 * 1000,
  15,
  'Too many requests. Please slow down.'
);

// files upload limit
export const uploadRateLimit = createLimiter(
  60 * 1000,
  10,
  'Too many upload attempts. Please wait.'
);