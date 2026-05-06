import opError from "../utils/classes/opError.class.js";
import prisma from "../configs/prisma.config.js";
import { parseMessageCursor } from "../utils/services/conversation.service.js";
import { buildMessageWhereClause, buildNextMessageCursor } from "../utils/queries/conversation.queries.js";
import {
  fetchMessagesFromCache,
  cacheMessages,
  invalidateConversationCache,
} from "../utils/services/conversationCache.service.js";

// get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  let { last_msg_seq, last_msg_time, limit = 10 } = req.query;
  limit = Number(limit);
  
  // parses the cursors (type conversions), throws error if cursors are invalid
  const { lastMsgTime, lastMsgSeq } = parseMessageCursor(last_msg_time, last_msg_seq);

  // try to fetch from cache
  const cachedMessages = await fetchMessagesFromCache(req.user.id, conversationId, lastMsgTime, lastMsgSeq);

  if (cachedMessages) {
    const nextCursor = buildNextMessageCursor(cachedMessages);
    return res.status(200).json({
      status: 'success',
      data: {
        cursor: nextCursor,
        messages: cachedMessages,
      },
    });
  }
  
  // find the conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      user_id: req.user.id,
    }
  });

  if (!conversation) {
    return next(new opError('Conversation not found.', 404));
  }

  // build query where clause for message pagination
  const whereClause = buildMessageWhereClause(conversationId, lastMsgTime, lastMsgSeq);

  // get messages from database
  const messages = await prisma.message.findMany({
    where: whereClause,
    orderBy: [
      { created_at: 'desc' },
      { seq: 'desc' }
    ],
    take: limit
  });

  // cache messages and set conversation version
  await cacheMessages(req.user.id, conversationId, messages, lastMsgTime, lastMsgSeq);

  // build cursor for pagination
  const nextCursor = buildNextMessageCursor(messages);

  res.status(200).json({
    status: 'success',
    data: {
      cursor: nextCursor,
      messages,
    },
  });
};

// delete conversation
export const deleteConversation = async (req, res, next) => {
  const { conversationId } = req.params;

  await prisma.conversation.delete({
    where: {
      id: conversationId,
      user_id: req.user.id,
    },
  });

  // invalidate conversation cache
  await invalidateConversationCache(req.user.id, conversationId);

  res.status(200).json({
    status: 'success',
    message: 'Conversation deleted successfully.',
  });
};

// get all conversations for a user
export const getMyConversations = async (req, res, next) => {
  const { skip, limit, page } = req.pagination;
  const conversations = await prisma.conversation.findMany({
    where: {
      user_id: req.user.id,
    },
    orderBy: {
      created_at: 'desc',
    },
    skip,
    take: limit,
  });

  res.status(200).json({
    status: 'success',
    data: {
      page,
      limit,
      conversations,
    },
  });
};
