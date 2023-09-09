const jwt = require("jsonwebtoken");
const otp = require("otp-generator");
const crypto = require("crypto");

//
const User = require("../Models/User");
const filterObject = require("../utils/filterObject");
const { promisify } = require("util");

const signToken = function (UserId) {
  return jwt.sign({ UserId }, process.env.JWT_SECRET_KEY);
};

//Register New User
exports.signIn = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filterBody = filterObject(
    req.body,
    "firstName",
    "lastName",
    "password",
    "email"
  );

  //check if there is user with the same email
  const existing_user = await User.findOne({ email: email });
  if (existing_user?.verified) {
    res.status(400).json({
      status: "error",
      message: "This Email is already used,Please login",
    });
    return;
  } else if (existing_user && !existing_user.verified) {
    const updatedUser = await User.findOneAndUpdate(
      { email: email },
      filterBody,
      { new: true, upsert: true, validateModifiedOnly: true }
    );
    // generate OTP and sent email to user
    req.userId = updatedUser._id;
  } else {
    //if user is not available
    const new_user = await User.create({ filterBody });
    // generate OTP and sent email to user
    req.userId = new_user._id;
  }
  next();
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req.body;
  const new_otp = otp.generate(6, {
    digits: true,
    lowerCaseAlphabets: false,
    specialChars: false,
    upperCaseAlphabets: false,
  });
  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // ten mins after otp sent (it works with milliseconds);

  await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time: otp_expiry_time,
  });

  //TODO: Send Mail

  res.status(200).json({
    status: "success",
    message: "One Time-Password send Successfully",
  });
};

exports.verifyOTP = async (req, res, next) => {
  // verify OTP and update user record accordingly
  const { email, otp } = res.body;

  const user = User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  }).select("+otp");

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP is expired",
    });
    return;
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    res.status(400).json({
      status: "error",
      message: "The OTP is incorrect",
    });
    return;
  }

  // OTP is correct
  user.verified = true;
  user.otp = undefined;
  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified successfully",
    token,
  });
};

// LOg in the User
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email an password are required",
    });
  }

  const foundUser = await User.findOne({ email: email }).select("+password");

  if (
    !foundUser ||
    !(await foundUser.correctPassword(password, foundUser.password))
  ) {
    res.status(400).json({
      status: "error",
      message: "Email or Password is incorrect",
    });
    return;
  }

  const token = signToken(foundUser._id);

  res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    token,
  });
};

exports.protect = async (req, res, next) => {
  //Getting a Token (JWT) and check if it's actually there
  let token;

  if (req.headers.authorization?.startWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    res.status(400).json({
      status: "error",
      message: "You are not logged in, Please log in to get access",
    });
    return;
  }

  // verification of Token
  const decoded = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET_KEY
  );

  //check if user still exist

  const this_user = await User.findById(decoded.UserId);
  if (!this_user) {
    res.status(400).json({
      status: "error",
      message: "The User doesn't exist",
    });
    return;
  }

  //check if user changed their password after token was issued

  if (this_user.changedPasswordAfterTokenChanged(decoded.iat)) {
    res.status(400).json({
      status: "error",
      message: "User recently updated there password!, Please log in again",
    });
    return;
  }
  req.User = this_user;
  next();
};

//types of routes -> Protected (only Logged user can access these) & UnProtected

exports.forgotPassword = async (req, res, next) => {
  //get user email
  const { email } = req.body;
  const foundUser = User.findOne({ email });

  if (!foundUser) {
    res.status(400).json({
      status: "error",
      message: "There is no user wth the given email address",
    });
    return;
  }
  // Generate the random reset Token

  //https:// ...?code=asa5s1d5a4

  const resetToken = foundUser.createPasswordResetToken();
  const resetUrl = `https://whatsappclone.com/reset-password/?code=${resetToken}`;

  try {
    //TODO: => send Email with Reset URL

    res.status(200).json({
      status: "success",
      message: "Reset Password link sent to email",
    });
  } catch (error) {
    foundUser.passwordResetToken = undefined;
    foundUser.passwordResetExpires = undefined;
    await foundUser.save({ new: true, validateModifiedOnly: false });

    res.status(500).json({
      status: "error",
      message: "there was an error sending the email, Please try again later",
      error,
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  //get the new password and the user by Token

  const hashedToken = crypto
    .createHash("sha256")
    .update(req.param.token)
    .digest("hex");

  const foundUser = User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // if token has Expired
  if (!foundUser) {
    res.status(400).json({
      status: "error",
      message: "The token Has Expired",
    });
    return;
  }

  // update user password and reset token
  foundUser.password = req.body.password;
  foundUser.passwordChangedAt = Date.now();
  foundUser.updatedAt = Date.now();

  foundUser.passwordResetToken = undefined;
  foundUser.passwordResetExpires = undefined;

  await foundUser.save();

  // Login the user and send Jwt

  //TODO: => send an email to user informing about password changing

  const token = signToken(foundUser._id);

  res.status(200).json({
    status: "success",
    message: "Password Reseted successfully",
    token,
  });
};
