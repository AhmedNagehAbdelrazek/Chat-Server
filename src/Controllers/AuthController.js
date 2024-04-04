const jwt = require("jsonwebtoken");
const otp = require("otp-generator");
const crypto = require("crypto");

//
const User = require("../Models/User");
const filterObject = require("../utils/filterObject");
const { promisify } = require("util");
const hashData = require("../utils/hashData");
const sendEmail = require("../Services/Mailer");

const signToken = function (UserId) {
  return jwt.sign({ UserId }, process.env.JWT_SECRET_KEY);
};

//Register New User
exports.register = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObject(
    req.body,
    "firstName",
    "lastName",
    "email",
    "password"
  );

  // check if a verified user with given email exists

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    // user with this email already exists, Please login
    return res.status(400).json({
      status: "error",
      message: "Email already in use, Please login.",
    });
  } else if (existing_user) {
    // if not verified than update prev one

    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    // generate an otp and send to email
    req.userId = existing_user._id;
    next();
  } else {
    // if user is not created before than create a new one
    const new_user = await User.create(filteredBody);

    // generate an otp and send to email
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_otp = otp.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
    lowerCaseAlphabets: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 Mins after otp is sent

  const user = await User.findByIdAndUpdate(userId, {
    otp_expiry_time: otp_expiry_time,
  });

  user.otp = new_otp.toString();

  await user.save({ new: true, validateModifiedOnly: true });

  console.log(new_otp);

  // TODO send mail
  // mailService.sendEmail({
  //   from: "shreyanshshah242@gmail.com",
  //   to: user.email,
  //   subject: "Verification OTP",
  //   html: otp(user.firstName, new_otp),
  //   attachments: [],
  // });
  sendEmail(user.email, "Verification OTP", `Your OTP is ${new_otp}`);

  res.status(200).json({
    status: "success",
    message: "The verify code Sent to your Email",
  });
};

exports.verifyOTP = async (req, res, next) => { 
  // verify OTP and update user record accordingly
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP is expired",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    return res.status(400).json({
      status: "error",
      message: "The OTP is incorrect",
    });
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
    user_id: user._id,
  });
};

// Log in the User
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  console.log("user try to login");
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
    return res.status(400).json({
      status: "error",
      message: "Email or Password is incorrect",
    });
  }

  if(!foundUser.verified){
    return res.status(400).json({
      status: "error",
      message: "The account is Not Verified",
    });
  }

  const token = signToken(foundUser._id);

  res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    token,
    user_id: foundUser._id,
  });
};

exports.protect = async (req, res, next) => {
  //Getting a Token (JWT) and check if it's actually there
  let token;
  console.log();
  if (String(req.headers.authorization)?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
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
  req.user = this_user;
  next();
};

//types of routes -> Protected (only Logged user can access these) & UnProtected

exports.forgotPassword = async (req, res, next) => {
  //get user email
  const { email } = req.body;
  const foundUser = await User.findOne({ email });

  if (!foundUser) {
    res.status(400).json({
      status: "error",
      message: "There is no user wth the given email address",
    });
    console.error("There is no user wth the given email address");
    return;
  }
  // Generate the random reset Token

  //https:// ...?code=asa5s1d5a4
  console.log(!foundUser);
  const resetToken = foundUser.createPasswordResetToken();
  const resetUrl = `http://localhost:3000/auth/new-password/?token=${resetToken}`;
  console.log(resetUrl);
  console.log(resetToken);

  try {
    //TODO: => send Email with Reset URL

    res.status(200).json({
      status: "success",
      message: "Reset Password link sent to email",
    });
    await foundUser.save({ new: true, validateModifiedOnly: false });
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
  const resetToken = req.query.token || req.body.token;

  console.log("Token ", resetToken);
  console.log("Password ", req.body.password);

  if(!resetToken){
    return res.status(404).json({
      status: "error",
      message: "Something Went Wrong!!",
    });
  }
  const hashedToken = hashData(resetToken.toString("hex"));

  console.log("Hashed Token", hashedToken);

  const foundUser = await User.findOne({
    passwordResetToken: hashedToken,
    // passwordResetExpires: { $gt: Date.now() },
  });
  console.log("reset password user ", foundUser);
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
