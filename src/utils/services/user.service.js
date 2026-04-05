import prisma from '../../configs/prisma.config.js';
import opError from '../classes/opError.class.js';

export const findUserByFilter = async (
    filter, message = 'User not found.',
    shouldPresent = true, throwError = false) => {

        // find user
    const user = await prisma.user.findUnique({
        where: filter
    });

    // throw error (shouldPresent == true -> throws error if no user found)
    if ((shouldPresent ? !user : user) && throwError === true) {
        throw new opError(message, 404);
    }

    return user;
};