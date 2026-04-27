import express from 'express';
import { checkRedisStatus } from '../middlewares/serviceCheck.middleware.js';
import { checkRequiredFields } from '../middlewares/checkRequiFields.middleware.js';
import { 
    changePassword,
    completeForgotPassword,
    completeUserSignUp, 
    googleAuthCallback, 
    initForgotPassword, 
    initUserSignUp, 
    login, 
    logout,
    refresh } from '../controllers/auth.controller.js';
import { 
    authenticate,
    lowerCaseEmail, 
    validateLoginFields, 
    validateSignUpFields } from '../middlewares/auth.middleware.js';
import passport from 'passport';
import { GoogleAuthStrategy } from '../../auth-strategies/googleOAuth2.js';

const router = express.Router();

// use google OAUTH2 strategy in passport
passport.use(GoogleAuthStrategy);

// Route for Google OAUTH2 authentication
router.get('/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

// Route for handling Google OAUTH2 callback
router.get('/google/callback', googleAuthCallback);
    
 
// Route to initiate sign up and send OTP
router.post('/sign-up/init',
    checkRedisStatus(false), 
    checkRequiredFields([
        { name: 'email', type: 'string' },
        { name: 'password', type: 'string' }
    ]), 
    lowerCaseEmail, 
    validateSignUpFields, 
    initUserSignUp
);

// Route to verify OTP and complete registration
router.post('/sign-up/complete', 
    checkRedisStatus(false),
    checkRequiredFields([
        { name: 'email', type: 'string' },
        { name: 'otp', type: 'string' }
    ]), 
    lowerCaseEmail, 
    completeUserSignUp
);

// Route to login user
router.post('/login',
    checkRequiredFields([
        { name: 'email', type: 'string' },
        { name: 'password', type: 'string' }
    ]),
    lowerCaseEmail,
    validateLoginFields,
    login
);

// Route to initiate password reset process
router.post('/forgot-password/init',
    checkRequiredFields([
        { name: 'email', type: 'string' }
    ]),
    lowerCaseEmail,
    initForgotPassword
);

// Route to complete password reset process
router.post('/forgot-password/complete',
    checkRequiredFields([
        { name: 'email', type: 'string' },
        { name: 'otp', type: 'string' },
        { name: 'newPassword', type: 'string' }
    ]),
    lowerCaseEmail,
    completeForgotPassword
);
// Route to refresh access token
router.post('/refresh', refresh);

// authenticate for routes below
router.use(authenticate);

// Route to logout user
router.post('/logout', logout);

// Route to change password using current password
router.post('/change-password', 
    checkRequiredFields([
    { name: 'currentPassword', type: 'string' },
    { name: 'newPassword', type: 'string' }
]), 
changePassword
);

export default router;
