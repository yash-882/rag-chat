import bcrypt from 'bcrypt';
import {randomInt} from 'crypto';
import opError from '../classes/opError.class.js';

// generates bcrypt hash
export const generateBcryptHash = async (text, saltRounds = 10) => {
    return await bcrypt.hash(text, saltRounds);
}

// compares bcrypt hash with plain text, throws error if result is invalid
export const compareBcryptHash = async (text, hash, throwErr=true, message = 'Invalid credentials') => {
    const isValid = await bcrypt.compare(text, hash);
    
    if(isValid == false && throwErr === true){
        throw new opError(message, 401)
    }

    return isValid;
}

// generates random numbers based on length 
export const generateRandomInt = (length=4) => {
    return randomInt(10 ** (length - 1), 10 ** length);

}

// limits otp request/attempt count
export const limitOTPActions = (data, isRequestAttempt = false) => {

    if (!data) return null;

    const requestLimit = Number(process.env.OTP_REQUEST_LIMIT) || 5;
    const attemptLimit = Number(process.env.OTP_ATTEMPT_LIMIT) || 5;
    const actionType = !isRequestAttempt ? 'attemptCount' : 'requestCount';

    // block further requests if attempts are exhausted
    if (isRequestAttempt && data.attemptCount >= attemptLimit) {
        throw new opError('Maximum OTP attempts reached. Request a new OTP after some time.', 429);
    }

    // throw if limit exceeded
    if (data[actionType] >= (isRequestAttempt ? requestLimit : attemptLimit)) {
        throw new opError(
            `Too many OTP ${isRequestAttempt ? 'requests' : 'attempts'}. Please try again later.`, 429
        );
    }
};

// validates password length
export const validatePasswordLength = (password) => {
    if (password.length < 8) {
        throw new opError('Password must be at least 8 characters long', 400);
    }
}