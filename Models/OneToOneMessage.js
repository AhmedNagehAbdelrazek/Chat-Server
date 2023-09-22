const mongoose = require("mongoose");

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
        to: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
        from: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
        type:{
            type: String,
            enum: ["text", "image", "audio", "video"],
            default: "text"
        },
        subtype:{
            type: String,
            enum: ["reply"],
            default: "reply",
        },
        replyMsg:{
          type:mongoose.Schema.ObjectId,
          ref:"OneToOneMessage"
        },
        text: {
          type: String,
          required: [true, "Message cannot be empty"],
        },
        react:{
          type:String,
        },
        forward:{
          type:Boolean,
          default:false
        },
        read:{
          type:Boolean,
          default:false
        },
        starred:{
          type:Boolean,
          default:false
        },
        created_at: {
          type: Date,
          default: Date.now(),
        },
        file:{
            type:String,
        }
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
