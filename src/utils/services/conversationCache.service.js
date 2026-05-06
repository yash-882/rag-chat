import { getCache, setCache, deleteCache } from "./cache.service.js";

// ============= CACHE KEY GENERATORS =============

/**
 * Generate cache key for conversation version tracking
 * Used for cache invalidation
 */
export const getConversationVersionKey = (userId, conversationId) => {
  return `conversation:${userId}:${conversationId}`;
};

/**
 * Generate cache key for messages
 * Supports both paginated and first-page scenarios
 */
export const getMessagesCacheKey = (userId, conversationId, lastMsgTime = null, lastMsgSeq = null) => {
  if (lastMsgSeq && lastMsgTime) {
    return `messages:${userId}:${conversationId}:${lastMsgTime.toISOString()}:${lastMsgSeq}`;
  }
  return `messages:${userId}:${conversationId}:first`;
};

// ============= CACHE OPERATIONS =============

/**
 * Fetch messages from cache if conversation version exists
 */
export const fetchMessagesFromCache = async (userId, conversationId, lastMsgTime, lastMsgSeq) => {
  const convoVersionKey = getConversationVersionKey(userId, conversationId);
  const convoVersion = await getCache(convoVersionKey);

  // Only use cache if conversation version exists
  if (!convoVersion) {
    return null;
  }

  const messagesCacheKey = getMessagesCacheKey(userId, conversationId, lastMsgTime, lastMsgSeq);
  return await getCache(messagesCacheKey);
};

/**
 * Cache messages and set conversation version
 */
export const cacheMessages = async (userId, conversationId, messages, lastMsgTime, lastMsgSeq) => {
  const messagesCacheKey = getMessagesCacheKey(userId, conversationId, lastMsgTime, lastMsgSeq);
  
  // Cache messages for 10 minutes
  await setCache(messagesCacheKey, messages, 600);

  // Set/update conversation version in cache for 24 hours
  const convoVersionKey = getConversationVersionKey(userId, conversationId);
  await setCache(convoVersionKey, { conversationId }, 3600 * 24);
};

/**
 * Invalidate conversation cache on deletion
 */
export const invalidateConversationCache = async (userId, conversationId) => {
  const convoVersionKey = getConversationVersionKey(userId, conversationId);
  await deleteCache(convoVersionKey);
};
