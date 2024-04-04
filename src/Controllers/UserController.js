const User = require("../Models/User");
const filterObject = require("../utils/filterObject");
const FriendRequest = require("../Models/FriendRequest");

exports.updateMe = async (req, res, next) => {
  const { user } = req;

  const filterBody = filterObject(
    req.body,
    "firstName",
    "lastName",
    "about",
    "avatar"
  );

  const updatedUser = await User.findByIdAndUpdate(user._id, filterBody, {
    new: true,
    validateModifiedOnly: true,
  });

  res.status(200).json({
    status: "success",
    message: "Profile Updated Successfully",
    data: updatedUser,
  });
};

exports.getallUsers = async (req, res, next) => {
  const users = await User.find({ verified: true }).select(
    "firstName lastName _id status avatar"
  );

  const this_user = req.user;
  // console.log(this_user);
  //   console.log("requests is empty:", requests.length === 0);

  const friends_id = this_user.friends.map((friend) => friend.User._id.toString());

  const filteredUsers = await users.filter((user) => {
    //if the user is me or my friend then don't show him in the list
    if (
      user._id.toString() === this_user._id.toString() ||
      friends_id.includes(user._id.toString())
    ) {
      return false;
    }
    return true;
  });

  // console.log("allUsers", filteredUsers);


  res.status(200).json({
    status: "success",
    data: filteredUsers || [],
  });
};

exports.getMe = async (req, res, next) => {
  const { user } = req;

  const userDoc = {
    firstName: user.firstName,
    lastName: user.lastName,
    about: user.about || "",
    avatar: user.avatar || "",
  };

  // const filteredUser = user.select("firstName lastName about");
  res.status(200).json({
    status: "success",
    data: userDoc,
  });
};

exports.getFriends = async (req, res, next) => {
  const { user } = req;

  const friends_id = user.friends.map((friend) => friend.User._id);

  let friends = await User.find({ _id: { $in: friends_id } }).select(
    "firstName lastName _id status avatar"
  );

  res.status(200).json({
    status: "success",
    data: friends || [],
  });
};
exports.getRequests = async (req, res, next) => {
  const { user } = req;

  const requests = await FriendRequest.find({ recipient: user._id }).populate(
    "sender",
    "firstName lastName _id status avatar"
  );

  res.status(200).json({
    status: "success",
    data: requests || [],
  });
};
