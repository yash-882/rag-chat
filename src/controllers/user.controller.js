import prisma from "../configs/prisma.config.js";
import opError from "../utils/classes/opError.class.js";
import { compareBcryptHash } from "../utils/services/auth.service.js";
import { deleteCache, setCache } from "../utils/services/cache.service.js";
import { findUserByFilter } from "../utils/services/user.service.js";

// get current user profile (DB or cache hits in auth middleware so no need to fetch again)
export const getMe = async (req, res, next) => {
    const user = {...req.user};

    // remove the password before responding
    user.password = undefined;

    // check if the user already exists in cache
    if (req.isUserCached) {

        return res.status(200).json({
            status: 'success',
            data: {
                user,
            },
        });
    }

    // store in cache 
    const key = req.userCacheKey ?? `user-profile:${req.user.id}`;

    await setCache(key, req.user, 1200)

    res.status(200).json({
        status: 'success',
        data: {
            user,
        },
    });
};

// update user profile
export const updateMe = async (req, res, next) => {

    const allowedToUpdate = ['name'];
    const fieldsToUpdate = Object.keys(req.body || {});

    // PREVENTS SENSITIVE FIELDS UPDATION LIKE password and email)
    const invalidFields = fieldsToUpdate.filter(
        (field) => !allowedToUpdate.includes(field)
    );

    if (invalidFields.length > 0) {
        return next(
            new opError(`Invalid fields to update: ${invalidFields.join(', ')}`, 400)
        );
    }

    const { name } = req.body;

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id,
        },
        data: {
            name,
        },
        select: {
            id: true,
            name: true,
            email: true,
        },
    });

    // remove user profile from cache 
    const cacheKeySource = req.userCacheKey ?? `user-profile:${req.user.id}`;
    await deleteCache(cacheKeySource);

    res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully.',
        data: {
            user: updatedUser,
        },
    });
};

// delete user account
export const deleteMe = async (req, res, next) => {

    const { password: enteredPassword } = req.body;
    let userPassword = req.user.password || '';

    const messageOnErr = 'Account not found.';

    if (!userPassword) {

        // find user if user object doesnt contain password
        const user = await findUserByFilter(
            { id: req.user.id }, messageOnErr, true, true);

        userPassword = user.password;
    }

    // verify password
    await compareBcryptHash(
        enteredPassword, userPassword, true, 'Incorrect password', 400);

    // delete user
    await prisma.user.delete({
        where: {
            id: req.user.id,
        },
    });

    // remove user profile from cache 
    const cacheKeySource = req.userCacheKey ?? `user-profile:${req.user.id}`;
    await deleteCache(cacheKeySource);

    // clear all auth cookies
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

    // end response
    res.status(204).end();
};
