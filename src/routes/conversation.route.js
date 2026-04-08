import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { 
    deleteConversation, 
    getMessages, 
    getMyConversations 
} from '../controllers/conversation.controller.js';
import { paginate } from '../middlewares/pagination.middleware.js';

const router = express.Router();

// all routes require authentication
router.use(authenticate);

// get all conversations for the logged-in user
router.get('/list', paginate(12), getMyConversations);

// get all messages for a specific conversation
router.get('/:conversationId/messages', getMessages);

// delete a specific conversation
router.delete('/delete/:conversationId', deleteConversation);

export default router;
