function ConvertMsg(message, user) {
  let outgoing = false;
  if (message.from.toString() === user._id.toString()) {
    outgoing = true;
  }

  return message.deleted
    ? {
        _id: message._id,
        to: message.to,
        from: message.from,
        type: message.type,
        deleted: message.deleted,
        time: message.created_at,
        incoming: !outgoing,
        outgoing: outgoing,
      }
    : {
        _id: message._id,
        to: message.to,
        from: message.from,
        to_group: message.to_group,
        type: message.type,
        message: message.text,
        incoming: !outgoing,
        outgoing: outgoing,
        time: message.created_at,
        file: message.file,
        replyMsg: message.replyMsg,
        react: message.react,
        forward: message.forward,
        read: message.read,
        deleted: message.deleted,
        file_type: message.file_type,
        starred: user.starred_messages?.some(
          (msg) => msg._id.toString() === message._id.toString()
        ),
      };
}

module.exports = ConvertMsg;
