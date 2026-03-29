import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { 
    deleteConversation, 
    getMessages, 
    getMyConversations 
} from '../controllers/conversation.controller.js';

const router = express.Router();

// all routes require authentication
router.use(authenticate);

// get all conversations for the logged-in user
router.get('/list', getMyConversations);

// get all messages for a specific conversation
router.get('/:conversationId/messages', getMessages);

// delete a specific conversation
router.delete('/delete/:conversationId', deleteConversation);

export default router;
