import redisClient from '../configs/redis.config.js';
import opError from '../utils/classes/opError.class.js';

/**
 * Middleware to check if Redis service is available.
 * Prevents execution of controllers that rely on Redis (e.g., OTP) 
 * when the connection is down.
 */

export const checkRedisStatus = (isCaching = false) => {
    return (req, res, next) => {
        if (redisClient.isOpen === false && isCaching === false) {
            return next(new opError('Service temporarily unavailable. Please try again later.', 503));
        }

        next();
    }
};
