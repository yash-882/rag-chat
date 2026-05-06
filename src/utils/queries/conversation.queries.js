// build where clause for message pagination
// handles cursor-based pagination with tiebreaker
export const buildMessageWhereClause = (conversationId, lastMsgTime, lastMsgSeq) => {
  const whereClause = {
    conversation_id: conversationId,
  };

  if (lastMsgTime && lastMsgSeq) {
    whereClause.OR = [
      { created_at: { lt: lastMsgTime } },
      {
        created_at: lastMsgTime,
        seq: { lt: lastMsgSeq }, // tiebreaker for messages with same timestamp
      },
    ];
  } else {
    whereClause.created_at = { lt: lastMsgTime };
  }

  return whereClause;
};

// build next message cursor for pagination
// returns null if no messages exist
export const buildNextMessageCursor = (messages) => {
  if (!messages || messages.length === 0) {
    return null;
  }

  const lastMessage = messages[messages.length - 1];
  return {
    created_at: lastMessage.created_at,
    last_msg_seq: lastMessage.seq,
  };
};
