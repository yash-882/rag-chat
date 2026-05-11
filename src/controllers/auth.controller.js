import opError from '../utils/classes/opError.class.js';
import sendEmail from '../utils/services/email.service.js';
import jwt from 'jsonwebtoken';
import { 
  compareBcryptHash, 
  generateBcryptHash, 
  generateRandomInt, 
  limitOTPActions, 
  validatePasswordLength} from '../utils/services/auth.service.js';
import RedisService from '../utils/services/classes/redis.service.js';
import { findUserByFilter } from '../utils/services/user.service.js';
import { generateTokens } from '../utils/services/token.service.js';
import prisma from '../configs/prisma.config.js';
import passport from 'passport';
import { deleteCache } from '../utils/services/cache.service.js';

// create user
export const initUserSignUp = async (req, res, next) => {

  const { name, email, password } = req.body;

  // validates password length, throws error if conditions are not met
  validatePasswordLength(password);

  // check if user already exists with the same email, throws err
  await findUserByFilter({email}, 'Email is already registered with us.', false, true)

  // generate 6 digits OTP
  const digits = 6;
  const otp = generateRandomInt(digits).toString();

  const redis = new RedisService(email, 'SIGN_UP_OTP');

  const data = await redis.getData();

  // limit OTP requests (returns updated count of request or throws error if limit exceeded)
  limitOTPActions(data, true);

  // otp data
  const dataToStore = { 
    name, 
    hashedOtp: await generateBcryptHash(otp, 10),  
    password, 
    email: email,
    requestCount: data ? data.requestCount + 1 : 1,
    attemptCount: 0
  };

  const isUpdate = !!data;
  
  // Store/update data for sign-up verification with a TTL of 10 minutes
  await redis.setShortLivedData(dataToStore, 600, isUpdate);

  // Send OTP to user's email
  await sendEmail(email, 'OTP for Registration', `Your OTP for completing the sign-up process is: ${otp}.`);
  
  res.status(201).json({
    status: 'success',
    message: 'OTP sent to your email. Please verify to complete registration.'
  });
}

export const completeUserSignUp = async (req, res, next) => {
  const { email, otp } = req.body;

  const redis = new RedisService(email, 'SIGN_UP_OTP');

  // check if user already exists with the same email
  await findUserByFilter({email}, 'Email is already registered with us.', false, true)

  const data = await redis.getData();

  if (!data) {
    return next(new opError('OTP expired or invalid session. Please request a new OTP.', 400));
  }

  // limit OTP requests (returns updated count of attempt or throws error if limit exceeded)
  limitOTPActions(data, false);

  const isValid = await compareBcryptHash(otp, data.hashedOtp, false);

  if (!isValid) {
    await redis.setShortLivedData({ 
      ...data, 
      attemptCount: (data.attemptCount || 0) + 1 }, 600, true);

    return next(new opError('Invalid OTP. Please try again.', 401));
  }

    // proceed to create the user
  const { name, email: storedEmail, password } = data;

  const hashedPassword = await generateBcryptHash(password, 12); // hashed password

  const newUser = await prisma.user.create({
    data: {
      name,
      email: storedEmail,
      password: hashedPassword,
      auths: ['LOCAL'], // sign-up method (LOCAL)
    }
  });

  // Remove the OTP data from Redis after successful sign-up
  await redis.deleteData();

  newUser.password = undefined; // remove password from the response

  res.status(201).json({
    status: 'success',
    message: 'User created successfully.',
    data: {
      user: newUser
    }
  });
}

// login user
export const login = async (req, res, next) => {
  const { email, password } = req.body;

    // check if no user exists with the provided email, throws error
  const user = await findUserByFilter({email}, 'Email is not registered with us.', true, true)


  if(!user.auths.includes('LOCAL')){
    return next(new opError(`This email is registered via Google. Please use that method to login.`, 400))
  }

  // compare password
  await compareBcryptHash(
    password, user.password, true, 'Incorrect password.', 400);

  // get tokens
  const { accessToken, refreshToken } = generateTokens({id: user.id, name: user.name})

  res.cookie('AT', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30days
  });

  res.cookie('RT', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30days
  });
  
  // remove password from the response
  user.password = undefined;

  res.status(200).json({
    status: 'success',
    message: 'Login successful.',
    data: {
      user
    }
  });
}

export const logout = async (req, res, next) => {
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
    message: 'Logged out successfully.'
  });
}

// generates new access token using refresh token
export const refresh = async (req, res, next) => {
  const refreshToken = req.cookies.RT;

  if (!refreshToken) {
    return next(new opError('Refresh token not found. Please login.', 401));
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // generate new tokens
    const { accessToken } = generateTokens({ id: decoded.id, name: decoded.name });

    // set new access token in cookies
    res.cookie('AT', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token refreshed successfully.'
    });

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new opError('Refresh token expired. Please login again.', 401));
    }
    return next(err);
  }
}

// change password
export const changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // validates password length, throws error if not conditions dont meet
  validatePasswordLength(newPassword);

  // find user by id from authenticated request
  const user = await findUserByFilter({ id: req.user.id }, 'User not found.', true, true);

  // check if user has signed up using OAuth method, if yes then don't allow password change
  if(!user.auths.includes('LOCAL')){
    return next(new opError(`Password change not allowed. Your account is registered via Google.`, 400))
   }
  
  // verify old password
  await compareBcryptHash(
    currentPassword, user.password, true, 'Current password is incorrect.', 400);
  
  // check if the new password is not different
  if(currentPassword === newPassword){
    return next(
      new opError('New password cannot be the same as the current password.', 400));
  }
  
  // hash new password
  const hashedNewPassword = await generateBcryptHash(newPassword, 12);

  // update password in database
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedNewPassword },
  });

  // invalidate user profile cache
  await deleteCache(`user-profile:${req.user.id}`);

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully.',
  });
};

// initiate password reset process by requesting OTP
export const initForgotPassword = async (req, res, next) => {
  const { email } = req.body;

  // check if user exists
  await findUserByFilter({ email }, 'Email is not registered with us.', true, true);

  // generate 6 digits OTP
  const digits = 6;
  const otp = generateRandomInt(digits).toString();

  const redis = new RedisService(email, 'FORGOT_PASSWORD_OTP');

  const data = await redis.getData();

  // limit OTP requests
  limitOTPActions(data, true);

  // otp data
  const dataToStore = {
    hashedOtp: await generateBcryptHash(otp, 10),
    email: email,
    requestCount: data ? data.requestCount + 1 : 1,
    attemptCount: 0
  };

  const isUpdate = !!data;

  // Store data for 10 minutes
  await redis.setShortLivedData(dataToStore, 600, isUpdate);

  // Send OTP to user's email
  await sendEmail(email, 'Password Reset OTP', `Your OTP for resetting your password is: ${otp}.`);

  console.log(otp);

  res.status(200).json({
    status: 'success',
    message: 'OTP sent to your email. Please verify to reset your password.'
  });
};


// complete password reset process by verfying using OTP
export const completeForgotPassword = async (req, res, next) => {
  const { email, otp, newPassword } = req.body;
  
  const redis = new RedisService(email, 'FORGOT_PASSWORD_OTP');
  const data = await redis.getData();
  
  if (!data) {
    return next(new opError('OTP expired or invalid session. Please request a new OTP.', 400));
  }

  // validates password length
  validatePasswordLength(newPassword);

  // limit OTP attempts
  limitOTPActions(data, false);

  const isValid = await compareBcryptHash(otp, data.hashedOtp, false);

  if (!isValid) {
    await redis.setShortLivedData({
      ...data,
      attemptCount: (data.attemptCount || 0) + 1
    }, 60, true);

    return next(new opError('Invalid OTP. Please try again.', 400));
  }

  // hash new password
  const hashedNewPassword = await generateBcryptHash(newPassword, 12);

  const user = await findUserByFilter({ email }, 'Email is not registered with us.', true, true);

  const update = user.auths.includes('LOCAL') ?
  { password: hashedNewPassword } :
  { password: hashedNewPassword, auths: { push: 'LOCAL' } };

  // update password in database and auths method
  await prisma.user.update({
    where: { id: user.id },
    data: update,
  });


  // Remove the OTP data from Redis after successful password reset
  await redis.deleteData();

   // invalidate user profile cache
  await deleteCache(`user-profile:${user.id}`);

  res.status(200).json({
    status: 'success',
    message: 'Password reset successfully. You can now login with your new password.',
  });
};


// google OAUTH2 callback (the user is redirected to this callback
// after clicking 'Allow access', then passport handles the auth flow)
export const googleAuthCallback = (req, res, next) => {
     passport.authenticate('google', { session: false }, (err, user, info) => {

        // (db error, passport error, unauthorized error)
        if(err)
            return next(err)

        // user denied the permission
        if(!user){
            return next(
                new opError('Google authentication failed!', 400))
        }
     
    // auth successful:

   // get tokens
  const { accessToken, refreshToken } = generateTokens({id: user.id, name: user.name})

  res.cookie('AT', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30days
  });

  res.cookie('RT', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30days
  });

    // Redirect to the frontend OAuth callback page
    // Cookies (AT, RT) are already set above — the frontend will call /my-profile
    // to pick up the session.
    const FRONTEND_URL = process.env.FRONTEND_URL;
    return res.redirect(`${FRONTEND_URL}/oauth-callback`);

     })(req, res, next)
}