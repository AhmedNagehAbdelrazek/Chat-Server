const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  to: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  to_group:{
    type: mongoose.Schema.ObjectId,
    ref: "OneToManyMessage",
  },
  from: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  type: {
    type: String,
    enum: ["text","image","link","doc", "audio", "video", "deleted", "forward"],
    default: "text",
  },
  replyMsg: {
    type: mongoose.Schema.ObjectId,
    ref: "OneToOneMessage",
  },
  text: {
    type: String,
    required: [true, "Message cannot be empty"],
  },
  react: {
    type: String,
  },
  forward: {
    type: Boolean,
    default: false,
  },
  read: {
    type: Boolean,
    default: false,
  },
  user_read_list:{
    type: Array,
    default: [],
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now(),
  },
  file: {
    type: String,
  },
  file_type: {
    type: String,
    enum: ["image", "audio", "video"],
  },
});

const Message = new mongoose.model("Message", messageSchema);

module.exports = Message;
