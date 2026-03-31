import { prismaClient as prisma } from "../server.js";
import opError from "../utils/classes/opError.class.js";
import { compareBcryptHash } from "../utils/services/auth.service.js";

// get current user profile
export const getMe = async (req, res, next) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id,
        },
        select: {
            id: true,
            name: true,
            email: true,
            created_at: true,
        },
    });

    if (!user) {
        return next(new opError('User not found.', 404));
    }

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

    const { password } = req.body;

    // verify password
    await compareBcryptHash(
        password, req.user.password, true, 'Incorrect password.', 400);

    // delete user
    await prisma.user.delete({
        where: {
            id: req.user.id,
        },
    });

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

    res.status(200).json({
        status: 'success',
        message: 'Account deleted successfully.',
    });
};
