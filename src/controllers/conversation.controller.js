import opError from "../utils/classes/opError.class.js";
import { prismaClient as prisma } from "../server.js";

// get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
  const { conversationId } = req.params;

  // find conversation with messages
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
      user_id: req.user.id,
    },
    include: {
      messages: {
        select:{
          id: true,
          content: true,
          role: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      },
    },
  });

  if (!conversation) {
    return next(new opError('Conversation not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      messages: conversation.messages,
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
  const conversations = await prisma.conversation.findMany({
    where: {
      user_id: req.user.id,
    },
    select: {
      id: true,
      created_at: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  res.status(200).json({
    status: 'success',
    data: {
      conversations,
    },
  });
};
