const router = require('express').Router();
const userController = require('../Controllers/UserController');
const authController = require('../Controllers/AuthController');


router.patch("/update-me",authController.protect,userController.updateMe);

router.get("/get-me",authController.protect,userController.getMe);

router.get("/get-users",authController.protect,userController.getallUsers);
router.get("/get-friends",authController.protect,userController.getFriends);
router.get("/get-requests",authController.protect,userController.getRequests);

// router.patch("/send-request",authController.protect,userController.sendRequest);
// router.patch("/accept-request",authController.protect,userController.acceptRequest);
// router.patch("/reject-request",authController.protect,userController.rejectRequest);
// router.patch("/unfriend",authController.protect,userController.unfriend);

// router.get("/get-chats",authController.protect,userController.getChats);
// router.delete("/delete-chat",authController.protect,userController.deleteChat);

// router.get("/get-messages",authController.protect,userController.getMessages);
// router.post("/send-message",authController.protect,userController.sendMessage);
// router.delete("/delete-message",authController.protect,userController.deleteMessage);


module.exports = router;
