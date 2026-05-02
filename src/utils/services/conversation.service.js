import prisma from "../../configs/prisma.config.js";
import opError from "../classes/opError.class.js";

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
        memory: [], // explicitly initialize empty memory
      },
    });
  }

  // ensure memory is always an array (in case of DB corruption or null values)
  if (!Array.isArray(conversation.memory)) {
    conversation.memory = [];
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
      throw new opError('Invalid cursor for getting messages.', 400);
    }
    lastMsgTime = parsed;
  }

  // check type of sequence number
  if (lastMsgSeq && isNaN(Number(lastMsgSeq))) {
    throw new opError('Invalid sequence number for getting messages.', 400);
  }

  return {
    lastMsgTime,
    lastMsgSeq: lastMsgSeq ? Number(lastMsgSeq) : null
  }
}

// update conversation memory (for follow-up question context)
export const updateConversationMemory = async (conversation, chat) => {

  const MAX_MEMORY_LENGTH = 4; // max number of messages (Q&A pairs) to keep in memory

  // validate and initialize memory if needed
  if (!Array.isArray(conversation.memory)) {
    conversation.memory = [];
  }

  // create a new memory array instead of mutating the original
  let updatedMemory = [...conversation.memory];

  if(updatedMemory.length > MAX_MEMORY_LENGTH * 2) {
    
    // if memory exceeds the limit, we trim the oldest messages (sliding window)
    updatedMemory = updatedMemory.slice(-MAX_MEMORY_LENGTH * 2);
  }

  updatedMemory.push({ role: 'USER', content: chat.question });
  updatedMemory.push({ role: 'ASSISTANT', content: chat.answer });

  // update conversation memory with the new Q&A pair for better context in follow-ups
  let updated;
  try {
    updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { memory: updatedMemory }
    });
  } catch (err) {
    console.error(`Failed to update memory for conversation ${conversation.id}:`, err);
    throw new opError(`Memory update failed: ${err.message}`, 500);
  }

  // verify the update was applied
  if (!updated) {
    throw new opError(`Memory update returned null for conversation ${conversation.id}`, 500);
  }

  // update the original object reference so caller sees the new memory state
  conversation.memory = updated.memory;
  
  return updated; // return the updated conversation object
}