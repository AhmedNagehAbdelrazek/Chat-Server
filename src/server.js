const ConvertMsg = require("./utils/ConvertMsg");
const Utilis = require("./utils/Utilies");

const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const path = require("path");

const User = require("./Models/User");
const FriendRequest = require("./Models/FriendRequest");
const OneToOneMessage = require("./Models/OneToOneMessage");
const OneToManyMessage = require("./Models/OneToManyMessage");
const Message = require("./Models/Message");

let DBConnected = false;

dotenv.config({ path: "../config.env" });

process.on("uncaughtException", (err) => {
  console.error(err);
  process.exit(1);
});

const http = require("http");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_LINK,
    methods: ["GET", "POST", "DELETE", "PUT"],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 60 * 1000,
    skipMiddlewares: true,
  },
});

// const DB = process.env.DBURI.replace("<password>", process.env.MONGODBPASSWORD);
const DB = process.env.DBURI_NEW.replace("<password>", process.env.MONGODBPASSWORD_NEW);

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
    const user = await User.findByIdAndUpdate(user_id, {
      socket_id,
      status: "Online",
      updatedAt: Date.now(),
    });

    // user.friends.forEach((friend) => {
    //   //broadcast user is disconnected to all friends
    //   socket
    //     .to(friend.User.socket_id)
    //     .emit("update_users_status", { user_id: user._id, status: "Online" });
    // });
    socket.broadcast.emit("update_users_status", {
      user_id: user._id,
      status: "Online",
      updatedAt: user.updatedAt,
    });

    let joinedRooms = await OneToManyMessage.find({participants: {$all:[user._id]}});
    joinedRooms.forEach((room) => {
      socket.join(room.name);
    });
  }
  
  //? socket event listeners
  socket.onAny(async (event, ...args) => {
    await User.findByIdAndUpdate(
      user_id,
      { updatedAt: Date.now() },
      { new: true, validateModifiedOnly: true }
    );
    // console.log("onAny",event, args);
  });
  socket.on("test", (data) => {
    console.log("test event");
    socket.join("test_room");
    socket.emit("test", "Hello from the test");
  })
  socket.on("test_room", (data) => {
    io.to("test_room").emit("test_room_echo", data);
    socket.to("test_room").emit("test_room_echo", data);
    console.log(socket.adapter.rooms);
  })

  // ? Friend Requests:
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
  // socket.on("refersh_friends", async ({ user_id },callback) => {
  //   const user = await User.findById(user_id);

  //   const friends_id = user.friends.map((friend) => friend.User._id);

  //   let friends = await User.find({ _id: { $in: friends_id } }).select(
  //     "firstName lastName _id status avatar updatedAt"
  //   );

  //   callback(friends);
      
  // });
  // Chat Features Direct & Group
  //*
  // socket.on("get_all_conversations", async ({ user_id, type }, callback) => {
  //   console.log("get_direct_conversation", user_id);
  //   let conversationType = Utilis.getType(type);
  //   let existing_conversations;
  //   if (conversationType === null) {
  //     socket.send("Conversation Type is Wrong!!", { severity: "error" });
  //     callback(null);
  //     return;
  //   }
  //   if (conversationType === "direct") {
  //     existing_conversations = await OneToOneMessage.find({
  //       participants: { $all: [user_id] },
  //     })
  //       .populate("participants", "firstName lastName _id avatar status")
  //       .populate("messages");
  //       existing_conversations.forEach((conversation) => {
  //         conversation.participants = conversation.participants.filter(
  //           (participant) => participant._id.toString() !== user_id.toString()
  //         );
  //       });
  //   }else if (conversationType === "group") {
  //     existing_conversations = await OneToManyMessage.find({
  //       participants: { $all: [user_id] },
  //     })
  //       .populate("participants", "firstName lastName _id avatar status")
  //       .populate("messages");
  //   }
      
  //     const sender = await User.findById(user_id);

  //     const filtered_conversations = existing_conversations.map(
  //       (conversation) => {
  //         const receiver = conversation.participants[0];

  //         const pinned = sender?.friends.some((friend) => friend.pinned);

  //         const lastMsg =
  //           conversation.messages[conversation.messages.length - 1];
  //         const unreadMsgs = conversation.messages
  //           .filter((m) => m.user_read_list.find(user=>user.toString() === user_id.toString()) !== null)
  //           .reduce((acc, val) => (val.read ? acc : acc + 1), 0);
  //         let messages = conversation.messages.map((m) => {
  //           return ConvertMsg(m, sender);
  //         });
  //         if (conversationType === "direct") {
  //           return {
  //             id: conversation._id,
  //             _id: receiver._id,
  //             img: receiver.avatar || "",
  //             firstName: receiver.firstName,
  //             lastName: receiver.lastName,
  //             msg: lastMsg?.text || "",
  //             time: lastMsg?.created_at || "",
  //             unread: unreadMsgs,
  //             pinned,
  //             online: receiver.status === "Online",
  //             messages: messages,
  //           };
  //         }else if (conversationType === "group") {
  //           return {
  //             id: conversation._id,
  //             img: conversation.img || "",
  //             name: conversation.name || "",
  //             msg: lastMsg?.text || "",
  //             time: lastMsg?.created_at || "",
  //             unread: unreadMsgs,
  //             pinned,
  //             admins: [...conversation.admins] || "",
  //             messages: messages,
  //             members: conversation.participants,
  //           };
  //         }

  //       }
  //     );
  //     callback(filtered_conversations);
  // });
  //*
  // socket.on("get_current_conversation",async ({ user_id, conversation_id ,type}, callback) => {
  //     console.log("get_current_messages");
  //     let conversationType = Utilis.getType(type);
  //   let conversation;
  //   if (conversationType === null) {
  //     socket.send("Conversation Type is Wrong!!", { severity: "error" });
  //     callback(null);
  //     return;
  //   }
  //   if (conversationType === "direct") {
  //     conversation = await OneToOneMessage.findById(conversation_id)
  //     .populate("messages")
  //     .populate("messages.replyMsg");
  //   }else if (conversationType === "group") {
  //     conversation = await OneToManyMessage.findById(conversation_id)
  //     .populate("participants", "firstName lastName _id avatar status")
  //     .populate("messages")
  //     .populate("messages.replyMsg");
  //   }
      
  //     const sender = await User.findById(user_id);

  //     if (conversation) {
  //       if (conversationType === "direct") {
  //         conversation.messages.forEach(async (message) => {
  //           if (message.read === true || message?.to.toString() !== user_id.toString()) {
  //             return;
  //           }
  //           message.read = true;
  //           const msg = await Message.findById(message._id);
  //           if (msg.read === false) {
  //             msg.read = true;
  //             await msg.save({ new: true, validateModifiedOnly: true });
  //           }
  //         });
  
  //         await conversation.save({ new: true, validateModifiedOnly: true });
  //         const messages = conversation.messages.map((message) =>
  //           message.deleted
  //             ? { to: message.to, from: message.from, type: message.type }
  //             : ConvertMsg(message, sender)
  //         );
  //         let results ={
  //           _id: conversation._id,
  //           messages: messages,
  //         }
  //         callback(results);
  //         return;
  //       }else if (conversationType === "group") {
  //         conversation.messages.forEach(async (message) => {
  //           if (message.read === true || message?.to.toString() !== user_id.toString() ) {
  //             return;
  //           }
  //           message.user_read_list.push(user_id);
  //           if(message.user_read_list.length === conversation.participants.length){
  //             message.read = true;
  //           }
  //           const msg = await Message.findById(message._id);
  //           if (msg.read === false) {
  //             msg.user_read_list.push(user_id);
  //             if(msg.user_read_list.length === conversation.participants.length){
  //               msg.read = true;
  //             }
  //             await msg.save({ new: true, validateModifiedOnly: true });
  //           }
  //         });
  
  //         await conversation.save({ new: true, validateModifiedOnly: true });
  //         const messages = conversation.messages.map((message) =>
  //           message.deleted
  //             ? { to: message.to, from: message.from, type: message.type }
  //             : ConvertMsg(message, sender)
  //         );
  //         let results ={
  //           _id: conversation._id,
  //           name: conversation.name || "",
  //           img: conversation.img || "",
  //           admins: conversation.admins || "",
  //           participants: conversation.participants,
  //           messages: messages,
  //         }
  //         callback(results);
  //         return;
  //       }
        
  //     }
  //     callback(null);
  //     socket.send("No Conversation Found", { severity: "error" });
  //   }
  // );
  //*
  
  // socket.on("create_conversation", async ({ to, from }, callback) => {
  //   // console.log("begin_conversation");
  //   // console.log("to :", to);
  //   // console.log("from :", from);

  //   const conversation = await OneToOneMessage.findOne({
  //     participants: { $all: [to, from] },
  //   })
  //     .populate("participants", "firstName lastName _id avatar status")
  //     .populate("messages");

  //   // console.log("conversation", conversation);
  //   if (conversation) {
  //     conversation.messages.forEach((message) => {
  //       if (message.to.toString() === user_id.toString()) {
  //         message.read = true;
  //       }
  //     });
  //     await conversation.save({ new: true, validateModifiedOnly: true });
  //     callback(conversation);
  //     return;
  //   }

  //   const new_conversation = await OneToOneMessage.create({
  //     participants: [to, from],
  //   });

  //   // console.log("new_conversation", new_conversation);
  //   await new_conversation.save({ new: true, validateModifiedOnly: true });

  //   callback(new_conversation);
  // });
  
  // socket.on("create_group", async ({ from,members,name,image}, callback) => {

  //   // console.log("begin_conversation");
  //   // console.log("to :", to);
  //   // console.log("from :", from);

  //   const conversation = await OneToManyMessage.findOne({
  //     participants: { $all: [from,...members] },name:name
  //   })
  //     .populate("participants", "firstName lastName _id avatar status")
  //     .populate("messages");

  //     if (!conversation) {
  //       const new_conversation = await OneToManyMessage.create({
  //         participants: [from,...members],
  //         name,
  //         img:image,
  //         admins:[from]
  //       });
  //       console.log("create Group", new_conversation);
  
  //     // console.log("new_conversation", new_conversation);
  //     await new_conversation.save({ new: true, validateModifiedOnly: true });

  //     socket.emit("join_group", {group_name: name});
      
  //     for(let user of members){
  //       user = await User.findById(user, "socket_id");
  //       socket.to(user.socket_id).emit("join_group", {group_name: name});
  //     }
  //     callback(new_conversation);
  //     return;
  //   }

    
  // });
  
  // socket.on("join_group", async ({user_id , name })=>{
  //   let joinedRoom = await OneToManyMessage.findOne({participants: {$all:[user_id]} , name:name})
  //   .populate("messages")
  //   .populate("messages.replyMsg")
  //   .populate("participants","firstName lastName _id avatar status")
  //   let sender = await User.findById(user_id);

  //   if(joinedRoom){

  //     let messages = joinedRoom.messages?.map((m) => {
  //       return ConvertMsg(m, sender);
  //     });
  //     socket.join(name);
  //     socket.emit("update_group", {
  //       conversation: joinedRoom,
  //       messages: messages || [],
  //     });
  //   }
  //   else{
  //     socket.send("No Conversation Found", { severity: "error" });
  //   }
  // });
  
  // socket.on("update_conversation", async ({ conversation_id, user_id ,type}) => {
  //   console.log("update_conversation",conversation_id, user_id ,type);
  //   if (
  //     conversation_id === undefined ||
  //     user_id === undefined ||
  //     conversation_id === null ||
  //     user_id === null
  //   ) {
  //     return;
  //   }
  //   let conversationType = Utilis.getType(type);
  //   let conversation;
  //   if (conversationType === null) {
  //     socket.send("Conversation Type is Wrong!!", { severity: "error" });
  //     return;
  //   }
  //   if (conversationType === "direct") {
  //     conversation = await OneToOneMessage.findById(conversation_id)
  //     .populate("participants", "socket_id")
  //     .populate("messages", "", "Message", { read: false, to: user_id })
  //     .populate("messages.replyMsg");
  //   }else if (conversationType === "group") {
  //     conversation = await OneToManyMessage.findById(conversation_id)
  //     .populate("participants", "firstName lastName _id avatar status socket_id")
  //     // ! Test $ne and $in 
  //     .populate("messages", "", "Message", { read: false, user_read_list:{$ne:{$in:[user_id]}}})
  //     .populate("messages.replyMsg");
  //   }
  //   console.log("conversation", conversation);

  //   if (conversation) {
  //     if (conversationType === "direct") {
  //       const recipient = conversation.participants.filter(
  //         (participant) => participant._id.toString() !== user_id.toString()
  //       )[0];
  
  //       conversation.messages.forEach(async (message) => {
  //         if (message?.to.toString() !== user_id.toString()) {
  //           return;
  //         }
  //         message.read = true;
  //         const msg = await Message.findById(message._id);
  //         if (msg.read === false) {
  //           msg.read = true;
  //           await msg.save({ new: true, validateModifiedOnly: true });
  //         }
  //       });
  
  //       const sender = await User.findById(user_id);
  //       let messages = conversation.messages.map((m) => {
  //         return ConvertMsg(m, sender);
  //       });
  //       console.log("updated_conversation", conversation);
  //       socket.emit("update_conversation", {
  //         conversation: conversation,
  //         messages: messages,
  //         type: conversationType,
  //       });
  //       if (io.sockets.sockets.get(recipient.socket_id)) {
  //         io.to(recipient.socket_id).emit("update_conversation", {
  //           conversation: conversation,
  //           messages: messages,
  //           type: conversationType,
  //         });
  //       }
  //       return;
  //     }else if (conversationType === "group") {
  //       conversation.messages.forEach(async (message) => {
  //         if (message.read === true || message?.user_read_list.find(user=>user.toString() === user_id.toString()) !== null) {
  //           return;
  //         }
  //         message.user_read_list.push(user_id);
  //         if(message.user_read_list.length === conversation.participants.length){
  //           message.read = true;
  //         }
  //         const msg = await Message.findById(message._id);
  //         if (msg.read === false) {
  //           msg.user_read_list.push(user_id);
  //           if(msg.user_read_list.length === conversation.participants.length){
  //             msg.read = true;
  //           }
  //           await msg.save({ new: true, validateModifiedOnly: true });
  //         }
  //       });
  //       await conversation.save({ new: true, validateModifiedOnly: true });
  
  //       const sender = await User.findById(user_id);
  //       let messages = conversation.messages.map((m) => {
  //         return ConvertMsg(m, sender);
  //       });
  //       io.to(socket_id).emit("update_conversation", {
  //         conversation: conversation,
  //         messages: messages,
  //         type: conversationType,
  //       });
  //       socket.to(conversation.name).emit("update_conversation", {
  //         conversation: conversation,
  //         messages: messages,
  //         type: conversationType,
  //       });

  //       return;
  //     }
      
  //   }
  // });

  // socket.on("send_message", async (data) => {
  //   // data: {to , from , text}
  //   const { to, from, message ,type,name,conversation_id} = data;
  //   console.log("Received Text Message");
  //   let conversationType = Utilis.getType(type);
  //   let conversation;
  //   if (conversationType === null) {
  //     socket.send("Conversation Type is Wrong!!", { severity: "error" });
  //     return;
  //   }
    

  //   if (conversationType === "direct") {
  //     conversation = await OneToOneMessage.findOne({
  //       participants: { $all: [to, from] },_id:conversation_id,
  //     }).populate("participants");
  //     const sender = conversation.participants.filter(
  //       (participant) => participant._id.toString() === from.toString()
  //     )[0];
  //     const recipient = conversation.participants.filter(
  //       (participant) => participant._id.toString() === to.toString()
  //     )[0];
  //     console.log("direct conversation", conversation);
  
  //     if (conversation) {
  //       // const read = io.sockets.sockets.get(to_socket_id) ? true : false;
  //       let read = false;
  //       let deliveredList = [from];
  
  //       if (io.sockets.sockets.get(recipient.socket_id)) {
  //         read = true;
  //         deliveredList.push(to);
  //       }
  //       const new_message = await Message.create({
  //         to: new mongoose.Types.ObjectId(to),
  //         from: new mongoose.Types.ObjectId(from),
  //         type: message.type,
  //         text: message.text,
  //         created_at: Date.now(),
  //         file: message.file,
  //         user_read_list: [deliveredList],
  //         read,
  //       });
  //       await new_message.save({ new: true, validateModifiedOnly: true });
  
  //       conversation.messages.push(new_message._id);
  //       // save to db
  //       await conversation.save({ new: true, validateModifiedOnly: true });
  
  //       // emit incoming message to Sender the receiver
  //       const send_message = ConvertMsg(new_message, sender);
        
  //       io.to(conversation.participants[0].socket_id).emit("new_message", {
  //         conversation: conversation,
  //         messages: send_message,
  //         type: conversationType,
  //       });
  //       io.to(conversation.participants[1].socket_id).emit("new_message", {
  //         conversation: conversation,
  //         messages: send_message,
  //         type: conversationType,
  //       }); 
  //     }
  //   }else if (conversationType === "group") {
  //     conversation = await OneToManyMessage.findById(conversation_id)
  //     .populate("participants", "firstName lastName _id avatar status socket_id")
  //     .populate("messages")
  //     .populate("messages.replyMsg");
  //     const sender = conversation.participants.filter(
  //       (participant) => participant._id.toString() === from.toString()
  //     )[0];
  //     const new_message = await Message.create({
  //       from: new mongoose.Types.ObjectId(from),
  //       to_group: new mongoose.Types.ObjectId(conversation_id),
  //       type: message.type,
  //       text: message.text,
  //       created_at: Date.now(),
  //       file: message.file,
  //       user_read_list: [from]
  //     });
  //     await new_message.save({ new: true, validateModifiedOnly: true });

  //     conversation.messages.push(new_message._id);
  //     // save to db
  //     await conversation.save({ new: true, validateModifiedOnly: true });

  //     // emit incoming message to Sender the receiver
  //     const send_message = ConvertMsg(new_message, sender);
  //     console.log(socket.adapter.rooms);

  //     io.to(conversation.name).emit("new_message", {
  //       conversation: conversation,
  //       messages: send_message,
  //       type: conversationType,
  //     });
  //     // callback(null);
  //     return;
  //   }
  //   // create a new conversation if it doesn't exist yet or add new message to the message list

  //   // const read = false;
  //   // if (io.sockets.sockets.get(recipient.socket_id)) {
  //   //   const conversation_id = socket
  //   //     .to(sender.socket_id)
  //   //     .emit("get_curr_conversation", ({ conversation_id }) => {
  //   //       return conversation_id;
  //   //     });
  //   //   console.log("current conversation id", conversation_id);
  //   // }

  //   // const new_message = await Message.create({
  //   //   to: new mongoose.Types.ObjectId(to),
  //   //   from: new mongoose.Types.ObjectId(from),
  //   //   type: message.type,
  //   //   text: message.text,
  //   //   created_at: Date.now(),
  //   //   file: message.file,
  //   //   read,
  //   // });
  //   // const new_conversation = await OneToOneMessage.create({
  //   //   participants: [to, from],
  //   //   messages: [new_message._id],
  //   // });

  //   // // save to db
  //   // await new_message.save({ new: true, validateModifiedOnly: true });
  //   // await new_conversation.save({ new: true, validateModifiedOnly: true });

  //   // const send_message = ConvertMsg(new_message, sender);

  //   // // emit incoming message to Sender & receiver
  //   // io.to(new_conversation.participants[0].socket_id).emit("new_message", {
  //   //   conversation: new_conversation,
  //   //   messages: send_message,
  //   //   type: send_message.type,
  //   // });
  //   // io.to(new_conversation.participants[1].socket_id).emit("new_message", {
  //   //   conversation: new_conversation,
  //   //   messages: send_message,
  //   //   type: send_message.type,
  //   // });
  // });

  socket.on("reply_message", async (data) => {
    // data: {to , from , text}
    const { to, from, conversation_id, message, reply_message_id } = data;
    console.log("Received Text Message", data);

    const conversation = await OneToOneMessage.findById(conversation_id);
    if (conversation) {
      conversation.messages.push({
        to,
        from,
        type: "reply",
        replyMsg: reply_message_id,
        text: message.text,
        created_at: Date.now(),
        file: message.file,
      });
      // save to db
      await conversation.save({ new: true, validateModifiedOnly: true });

      const new_messages = await OneToOneMessage.findById(
        conversation_id
      ).populate("messages.replyMsg");
      // emit incoming message to Sender the receiver
      io.to(conversation.participants[0].socket_id).emit("new_message", {
        message: new_messages,
        type: new_messages.type,
      });
      io.to(conversation.participants[1].socket_id).emit("new_message", {
        message: new_messages,
        type: new_messages.type,
      });
      return;
    }
    io.send("No Conversation Found", { severity: "error" });
  });
  socket.on("star_message", async (data) => {
    const { message_id, conversation_id } = data;
    const conversation = await OneToOneMessage.findById(conversation_id);
    const user = await User.findById(user_id);
    if (conversation) {
      const message = conversation.messages.filter(
        (msg) => msg._id.toString() === message_id.toString()
      )[0];
      user.starred_messages.push(message._id);
      await user.save({ new: true, validateModifiedOnly: true });
      // await conversation.save({ new: true, validateModifiedOnly: true });
      io.to(socket_id).emit("update_message", {
        message: "Stared Message Successfully",
        severity: "success",
        data: message,
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
  socket.on("react_message", async (data) => {
    const { message_id, conversation_id, react } = data;
    const conversation = await OneToOneMessage.findById(conversation_id);
    if (conversation) {
      const message = conversation.messages.filter(
        (msg) => msg._id.toString() === message_id.toString()
      )[0];
      message.react = react;
      await conversation.save({ new: true, validateModifiedOnly: true });
      io.to(socket_id).emit("update_message", {
        message: "Reacted Message Successfully",
        severity: "success",
        data: message,
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
  socket.on("forward_message", async (data) => {
    const { message_id, from_conversation_id, to_conversation_id } = data;
    const from_conversation = await OneToOneMessage.findById(
      from_conversation_id
    );
    const to_conversation = await OneToOneMessage.findById(to_conversation_id);
    const second_receiver = to_conversation.participants.filter(
      (participant) => participant._id.toString() !== user_id.toString()
    )[0];

    if (from_conversation && to_conversation) {
      const message = from_conversation.messages.filter(
        (msg) => msg._id.toString() === message_id.toString()
      )[0];

      message.forward = true;
      message.type = "forward";
      to_conversation.messages.push(message);
      await to_conversation.save({ new: true, validateModifiedOnly: true });

      io.to(second_receiver.socket_id).emit("new_message", {
        message: message,
        type: message.type,
      });
      io.to(socket_id).emit("update_message", {
        message: "Forwarded Message Successfully",
        severity: "success",
        data: message,
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
  socket.on("delete_message", async (data) => {
    const { message_id, conversation_id } = data;
    console.log("delete_message", message_id, conversation_id);
    const conversation = await OneToOneMessage.findById(conversation_id).select(
      "-messages"
    );
    if (conversation) {
      const sender = await User.findById(user_id);

      const message = await Message.findByIdAndUpdate(
        message_id,
        { deleted: true, type: "deleted" },
        { new: true, validateModifiedOnly: true }
      );
      // console.log("deleted message", message);

      // ? check if the message belongs to the user
      if (message.from.toString() !== user_id.toString()) {
        io.to(socket_id).emit("update_message", {
          message: "You can't delete this message",
          severity: "error",
        });
        return;
      }

      message.save({ new: true, validateModifiedOnly: true });

      io.to(socket_id).emit("update_conversation", {
        conversation: conversation,
        messages: ConvertMsg(message, sender),
      });
      io.to(socket_id).emit("update_message", {
        message: "Deleted Message Successfully",
        severity: "success",
      });
      return;
    }
    io.to(socket_id).emit("update_message", {
      message: "Message Not Found",
      severity: "error",
    });
  });
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

  socket.on("deliver_message", async (data) => {
      const {message_id,user_id} = data;
      
      const deliverd_user = await User.findById(user_id);

      let message = Message.findOne(message_id).populate("to_group").populate("to","socket_id");
      if(message){
        message.user_read_list = [...message.user_read_list,deliverd_user._id];
        if(message.to_group !== null && message.user_read_list.length === message.to_group.participants.length){
          message.read = true;
          socket.to(message).emit('message_updated', message);
        }else{
          socket.to(message.to.socket_id).emit('message_updated', message);
          message.read = true;
        }
        await message.save({ new: true, validateModifiedOnly: true });
      }
      
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
      const user = await User.findByIdAndUpdate(user_id, {
        status: "Offline",
      }).populate("friends.User", "socket_id");
      // broadcast user is disconnected to all friends
      user.friends.forEach((friend) => {
        socket.to(friend.User.socket_id).emit("update_users_status", {
          user_id: user._id,
          status: "Offline",
        });
      });
      // socket.broadcast.emit("update_users_status", {
      //   user_id: user._id,
      //   status: "Online",
      // });
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