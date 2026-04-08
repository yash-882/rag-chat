import jwt from "jsonwebtoken";
import opError from "../utils/classes/opError.class.js";
import { findUserByFilter } from "../utils/services/user.service.js";
import { getCache } from "../utils/services/cache.service.js";

export const lowerCaseEmail = (req, res, next) => {
    req.body.email = req.body?.email?.toLowerCase().trim() || '';
    next();
}

// verify jwt before allowing to access protected routes
export const authenticate = async (req, res, next) => {
    const token = req.cookies.AT;

    if (!token) {
        return next(new opError('Access denied. Please login.', 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        // Check cache or DB to verify user existence.
        // If present in cache, the user must also exist in the DB,
        // since cache entries are invalidated on update or deletion.
        const userExistsInCache = await getCache(`user-profile:${decoded.id}`)
        let userExistsInDB;

        if (!userExistsInCache) {
            userExistsInDB = await findUserByFilter({ id: decoded.id }, '', false, false);

            if (!userExistsInDB) {

                // clear cookies
                res.clearCookie('AT', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                });

                res.clearCookie('RT', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                });

                return next(new opError('Account not found', 401));
            }
        }

        // set user data to request object
        req.user = userExistsInCache || userExistsInDB;
        req.isUserCached = !!userExistsInCache;
        req.userCacheKey = `user-profile:${decoded.id}`;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new opError('Session expired. Please login again.', 401));
        }
        return next(new opError('Invalid token.', 401));
    }
};

// validate sign up fields for user registration
export const validateSignUpFields = async (req, res, next) => {

    let { email, password } = req.body || {};
    password = password.trim();

    const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);

    if (!isValidEmail) {
        return next(new opError('Invalid email format', 400));
    }

    if (password.length < 8) {
        return next(new opError('Password must be at least 8 characters long', 400));
    }

    req.body.email = email;
    req.body.password = password;

    next();
}

export const validateLoginFields = async (req, res, next) => {
    let { email, password } = req.body || {};
    password = password?.trim();

    const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
    if (!isValidEmail) {
        return next(new opError('Invalid email format', 400));
    }

    req.body.email = email;
    req.body.password = password;

    next();
}
