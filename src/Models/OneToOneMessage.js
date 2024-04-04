const mongoose = require("mongoose");
const Message = require("./Message");

const messageSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    messages: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Message",
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const OneToOneMessage = new mongoose.model("OneToOneMessage", messageSchema);

module.exports = OneToOneMessage;
