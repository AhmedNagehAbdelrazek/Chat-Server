const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const path = require("path");

const User = require("./Models/User");
const FriendRequest = require("./Models/FriendRequest");
const OneToOneMessage = require("./Models/OneToOneMessage");

let DBConnected = false;

dotenv.config({ path: "./config.env" });

process.on("uncaughtException", (err) => {
  console.error(err);
  process.exit(1);
});

const http = require("http");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "DELETE", "PUT"],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 60 * 1000,
    skipMiddlewares: true,
  },
});

const DB = process.env.DBURI.replace("<password>", process.env.MONGODBPASSWORD);

mongoose
  .connect(DB)
  .then((con) => {
    console.log("DB connection is successful");
    DBConnected = true;
  })
  .catch((err) => {
    console.error(err);
    DBConnected = false;
  });

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`app is running on port ${port}`);
});

io.on("connection", async (socket) => {
  // console.log(JSON.stringify(socket.handshake.query));
  // console.log(socket);

  // await new Promise((resolve) => {
  //   if (DBConnected) resolve();
  // }).then(()=>{
  //   console.log("DB Connected");
  // });

  const user_id = socket.handshake.query.user_id;

  if (user_id == null || user_id === "null") {
    socket.disconnect(0);
    console.log("disconnect Caused By User Id is Undefined");
    return;
  }

  const socket_id = socket.id;

  console.log("User Connected On Socket With Id : ", socket_id);
  console.log("User Id : ", user_id);

  if (Boolean(user_id)) {
    const user = await User.findByIdAndUpdate(user_id, { socket_id, status: "Online" }).populate("friends.User", "socket_id");

    user.friends.forEach((friend) => {
      //broadcast user is disconnected to all friends
      socket.to(friend.User.socket_id).emit("update_users_status",{user_id:user._id,status:"Online"});
    })
    socket.broadcast.emit("update_users_status",{user_id:user._id,status:"Online"});
  }
  // socket event listeners

  socket.on("friend_request", async (data) => {
    // console.log("friend request");
    // console.log(data);
    const { to, from } = data;

    const to_user = await User.findById(to).select("socket_id");
    const from_user = await User.findById(from).select("socket_id");

    if (to_user !== undefined && from_user !== undefined) {
      // make sure that no old request was made
      const result = await FriendRequest.find({ sender: from });
      // console.log(result);
      if (result.length > 0) {
        io.to(from_user.socket_id).emit("request_sent", {
          message: "request sent already",
        });
      } else {
        await FriendRequest.create({
          sender: from,
          recipient: to,
        });
        io.to(from_user.socket_id).emit("request_sent", {
          message: "friend request sent",
        });
        io.to(to_user.socket_id).emit("new_friend_request", {
          message: "new friend request received",
        });
      }
    }
  });
  socket.on("accept_request", async (data) => {
    // console.log(data);
    const { request_id } = data;
    const request_doc = await FriendRequest.findById(request_id);
    // console.log("request_Doc :", request_doc);
    if (request_doc) {
      // console.log("request_id :", request_id);
      // console.log("request_doc :", request_doc);

      const { sender, recipient } = request_doc;

      const sender_doc = await User.findById(sender);
      const recipient_doc = await User.findById(recipient);

      sender_doc.friends.push({ User: recipient });
      recipient_doc.friends.push({ User: sender });

      await sender_doc.save({ new: true, validateModifiedOnly: true });
      await recipient_doc.save({ new: true, validateModifiedOnly: true });

      await FriendRequest.findByIdAndDelete(request_id);
      io.to(sender_doc.socket_id).emit("request_accepted", {
        message: `${recipient_doc.firstName} ${recipient_doc.lastName} accepted your friend request`,
        severity: "success",
      });
      io.to(recipient.socket_id).emit("request_accepted", {
        message: `you have accepted friend request from ${sender_doc.firstName} ${sender_doc.lastName}`,
        severity: "success",
      });
      return;
    }
    io.to(socket_id).emit("request_accepted", {
      message: `there is no Request`,
      severity: "error",
    });
  });
  socket.on("refuse_request", async (data) => {
    const { request_id } = data;
    await FriendRequest.findByIdAndDelete(request_id);
  });
  socket.on("get_direct_conversation", async ({ user_id }, callback) => {
    console.log("get_direct_conversation");
    const existing_conversation = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate("participants", "firstName lastName _id avatar status");

    existing_conversation.forEach((conversation) => {
      conversation.participants = conversation.participants.filter(
        (participant) => participant._id.toString() !== user_id.toString()
      );
    });
    const sender = await User.findById(user_id);

    const filtered_conversations = existing_conversation.map((conversation) => {
      const receiver = conversation.participants[0];

      const pinned = sender?.friends.some((friend) => friend.pinned);

      // console.log("pinned", pinned);

      const lastMsg = conversation.messages[conversation.messages.length - 1];
      const unreadMsgs = conversation.messages.reduce(
        (acc, val) => (val.read ? acc : acc + 1),
        0
      );

      return {
        id: conversation._id,
        _id: receiver._id,
        img: receiver.avatar || "",
        firstName: receiver.firstName,
        lastName: receiver.lastName,
        msg: lastMsg?.text || "",
        time: lastMsg?.create_at || "",
        unread: unreadMsgs,
        pinned,
        online: receiver.status === "Online",
      };
    });

    // console.log("filtered_conversations", filtered_conversations);

    callback(filtered_conversations);
  });
  socket.on("begin_conversation", async ({ to, from }, callback) => {
    // console.log("begin_conversation");
    // console.log("to :", to);
    // console.log("from :", from);

    const conversation = await OneToOneMessage.findOne({
      participants: { $all: [to, from] },
    }).populate("participants", "firstName lastName _id avatar status");

    // console.log("conversation", conversation);
    if (conversation) {
      conversation.messages.forEach((message) => {
        if (message.to.toString() === user_id.toString()) {
          message.read = true;
        }
      });
      await conversation.save({ new: true, validateModifiedOnly: true });
      callback(conversation);
      return;
    }

    const new_conversation = await OneToOneMessage.create({
      participants: [to, from],
    });

    // console.log("new_conversation", new_conversation);
    await new_conversation.save({ new: true, validateModifiedOnly: true });

    callback(new_conversation);
  });
  socket.on("send_message", async (data) => {
    // data: {to , from , text}
    const { to, from, message } = data;
    console.log("Received Text Message", data);

    const conversation = await OneToOneMessage.findOne({
      participants: { $all: [to, from] },
    });
    if (conversation) {

      conversation.messages.push({
        to,
        from,
        type: message.type,
        text: message.text,
        created_at: Date.now(),
        file: message.file,
      });
      // save to db
      await conversation.save({ new: true, validateModifiedOnly: true });

      // emit incoming message to Sender the receiver
      io.to(conversation.participants[0].socket_id).emit("new_message", {
        message: message.text,
        type: message.type,
      });
      io.to(conversation.participants[1].socket_id).emit("new_message", {
        message: message.text,
        type: message.type,
      });
      return;
    }
    // create a new conversation if it doesn't exist yet or add new message to the message list
    const new_conversation = await OneToOneMessage.create({
      participants: [to, from],
      messages: [{ to, from, type: "text", text: message.text }],
    });

    // save to db
    new_conversation.save({ new: true, validateModifiedOnly: true });

    // emit incoming message to Sender & receiver
    io.to(new_conversation.participants[0].socket_id).emit("new_message", {
      message: message.text,
      type: message.type,
    });
    io.to(new_conversation.participants[1].socket_id).emit("new_message", {
      message: message.text,
      type: message.type,
    });

  });
  socket.on("reply_message", async (data) => {
    // data: {to , from , text}
    const { to, from,conversation_id, message , reply_message_id } = data;
    console.log("Received Text Message", data);

    const conversation = await OneToOneMessage.findById(conversation_id);
    if (conversation) {
      conversation.messages.push({
        to,
        from,
        type: message.type,
        subtype:"reply",
        replyMsg:reply_message_id,
        text: message.text,
        created_at: Date.now(),
        file: message.file,
      });
      // save to db
      await conversation.save({ new: true, validateModifiedOnly: true });

      // emit incoming message to Sender the receiver
      io.to(conversation.participants[0].socket_id).emit("new_message", {
        message: message.text,
        type: message.type,
      });
      io.to(conversation.participants[1].socket_id).emit("new_message", {
        message: message.text,
        type: message.type,
      });
      return;
    }
    // create a new conversation if it doesn't exist yet or add new message to the message list
    const new_conversation = await OneToOneMessage.create({
      participants: [to, from],
      messages: [{ to, from, type: "text", text: message.text }],
    });

    // save to db
    new_conversation.save({ new: true, validateModifiedOnly: true });

    // emit incoming message to Sender & receiver
    io.to(new_conversation.participants[0].socket_id).emit("new_message", {
      message: message.text,
      type: message.type,
    });
    io.to(new_conversation.participants[1].socket_id).emit("new_message", {
      message: message.text,
      type: message.type,
    });

  });
  socket.on("star_message", async (data) => {
    const {message_id,conversation_id} = data;
    const conversation = await OneToOneMessage.findById(conversation_id);
    if(conversation){
      const message = conversation.messages.filter((msg)=>msg._id.toString()===message_id.toString())[0];
      message.starred = true;
      await conversation.save({ new: true, validateModifiedOnly: true });
      io.to(socket_id).emit("update_message", {
        message: "Stared Message Successfully",
        severity: "success",
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
  socket.on("react_message", async (data) => {
    const {message_id,conversation_id,react} = data;
    const conversation = await OneToOneMessage.findById(conversation_id);
    if(conversation){
      const message = conversation.messages.filter((msg)=>msg._id.toString()===message_id.toString())[0];
      message.react = react;
      await conversation.save({ new: true, validateModifiedOnly: true });
      io.to(socket_id).emit("update_message", {
        message: "Reacted Message Successfully",
        severity: "success",
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
  socket.on("forward_message", async (data) => {
    const {message_id,from_conversation_id,to_conversation_id} = data;
    const from_conversation = await OneToOneMessage.findById(from_conversation_id);
    const to_conversation = await OneToOneMessage.findById(to_conversation_id);
    
    if(from_conversation && to_conversation){
      const message = from_conversation.messages.filter((msg)=>msg._id.toString()===message_id.toString())[0];
      
      message.forward = true;
      to_conversation.messages.push(message);
      await to_conversation.save({ new: true, validateModifiedOnly: true });
      io.to(socket_id).emit("update_message", {
        message: "Forwarded Message Successfully",
        severity: "success",
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  })
  socket.on("file_message", async (data) => {
    console.log("Received File Message", data);

    // data : {to,from,text,file};

    const fileExtension = path.extname(data.file.name);

    // generate a unique filename
    const fileName = `${Date.now()}_${Math.random() * 10000}${fileExtension}`;

    //upload the file to the server AWS(s3)

    // create a new conversation if it doesn't exist yet or add new message to the message list

    // save to db

    // emit incoming message to the receiver

    // emit outComing message to sender
  });
  socket.on("end", async (data) => {
    // console.log(data);
    // if (data.user_id) {
    //   await User.findByIdAndUpdate(data.user_id, { status: "Offline" });
    // }

    // // TODO: broadcast user is disconnected
    // io.sockets.emit("update_users_status");

    // console.log("close Connection");
    // socket.disconnect(0);
  });
  socket.on("disconnect", async (data) => {
    if (user_id) {
      const user = await User.findByIdAndUpdate(user_id, { status: "Offline" }).populate("friends.User", "socket_id");
      //broadcast user is disconnected to all friends 
      user.friends.forEach((friend) => {
        socket.to(friend.User.socket_id).emit("update_users_status",{user_id:user._id,status:"Offline"});
      })
    }
    console.log("user_id  has disconnected: ", user_id);
  });
  
});

process.on("unhandledRejection", (err) => {
  console.error(err);
  server.close(() => {
    process?.exit();
  });
});
