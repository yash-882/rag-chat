import prisma from "../../configs/prisma.config.js";

// conversation service

// get or initiate conversation
export const getOrCreateConversation = async (userId, conversationId) => {
  let conversation = null;

  if (conversationId) {
    conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        user_id: userId,
      },
    });
  }

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
      },
    });
  }

  return conversation;
};

// save message
export const saveMessage = async (conversationId, message, role, type) => {
  return await prisma.message.create({
    data: {
      conversation_id: conversationId,
      content: message,
      role,
      type,
    },
  });
};

// validate cursor for message pagination
export const parseMessageCursor = (lastMsgTime, lastMsgSeq) => {

    // get a Date format for prisma
    if (!lastMsgTime) {
      lastMsgTime = new Date();
    } else {
      // the cursor should be a date (as String or Date)
      const parsed = new Date(lastMsgTime);
  
      if (isNaN(parsed)) {
        return next(new opError('Invalid cursor for getting messages.', 400));
      }
      lastMsgTime = parsed;
    }
  
    // check type of sequence number
    if(lastMsgSeq && isNaN(Number(lastMsgSeq))){
      return next(new opError('Invalid sequence number for getting messages.', 400));
    }

    return {
      lastMsgTime,
      lastMsgSeq: lastMsgSeq ? Number(lastMsgSeq) : null
    }
}