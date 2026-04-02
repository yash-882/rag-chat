import opError from "../utils/classes/opError.class.js";
import { prismaClient as prisma } from "../server.js";

// get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  let { last_msg_id, last_msg_time } = req.query;

  let lastMsgTime;

  // get a Date format for prisma
  if (!last_msg_time) {
    lastMsgTime = new Date();
  } else {
    // the cursor should be a date (as String or Date)
    const parsed = new Date(last_msg_time);

    if (isNaN(parsed)) {
      return next(new opError('Invalid cursor for getting messages.', 400));
    }
    lastMsgTime = parsed;
  }

  // find the conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      user_id: req.user.id,
    }
  });

  if (!conversation) {
    throw new opError('Conversation not found.', 404);
  }

  // to fetch in limit
  const { limit } = req.pagination;

  const whereClause = {
    conversation_id: conversationId,
  };

  // if the last sent msg props are passed 
  if (last_msg_time && last_msg_id) {
    whereClause.OR = [
      { created_at: { lt: lastMsgTime } },

      // ensures we don't skip messages with the exact same Datetime
      {
        created_at: lastMsgTime,
        id: { lt: last_msg_id }
      }
    ];
  } 
  
  // default filter
  else {
    whereClause.created_at = { lt: lastMsgTime };
  }

  // get messages
  const messages = await prisma.message.findMany({
    where: whereClause,
    orderBy: [
      { created_at: 'desc' },
      { id: 'desc' }
    ],
    take: limit
  });

  // get last message details
  const lastMsg = messages.length > 0
    ? messages[messages.length - 1]
    : null;

  res.status(200).json({
    status: 'success',
    data: {
      // return the cursor of the last message sent by the client (used for pagination)
      cursor: lastMsg
        ? {
            created_at: lastMsg.created_at,
            id: lastMsg.id
          }
        : null,
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

  res.status(200).json({
    status: 'success',
    message: 'Conversation deleted successfully.',
  });
};

// get all conversations for a user
export const getMyConversations = async (req, res, next) => {
  const {skip, limit, page} = req.pagination;
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
