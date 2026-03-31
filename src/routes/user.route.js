import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { 
    deleteMe, 
    getMe, 
    updateMe 
} from '../controllers/user.controller.js';
import { checkRequiredFields } from '../middlewares/checkRequiFields.middleware.js';

const router = express.Router();

// all routes require authentication
router.use(authenticate);

// get current user profile
router.get('/me', getMe);

// update user profile
router.patch('/update-me',
    updateMe
);

// delete user account
router.delete('/delete-me', 
    checkRequiredFields([
        { name: 'password', type: 'string' }
    ]), 
    deleteMe
);

export default router;
