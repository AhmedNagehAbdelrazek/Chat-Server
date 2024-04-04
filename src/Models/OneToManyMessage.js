const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    name:{
        type:String,
    },
    img:{
      type:String
    },
    admins:{
        type: mongoose.Schema.ObjectId,
        ref: "User",
    },
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

const OneToManyMessage = new mongoose.model("OneToManyMessage", messageSchema);

module.exports = OneToManyMessage;
