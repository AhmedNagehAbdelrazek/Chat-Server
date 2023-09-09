const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "first Name is required"],
  },
  lastName: {
    type: String,
    required: [true, "last Name is required"],
  },
  avatar: {
    type: String,
  },
  email: {
    type: String,
    required: [true, "email is required"],
    validate: {
      validator: function (email) {
        return String(email)
          .toLocaleLowerCase()
          .match(
            RegExp(
              '/^(([^<>()[].,;:s@"]+(.[^<>()[].,;:s@"]+)*)|(".+"))@(([^<>()[].,;:s@"]+.)+[^<>()[].,;:s@"]{2,})$/i'
            )
          );
      },
      message: (params) => {
        return `The Email ${params} is invalid`;
      },
    },
  },
  password: String,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  createdAt: Date,
  updatedAt: Date,
  verified: {
    type: Boolean,
    default: false,
  },
  otp: Number,
  otp_expiry_time: Date,
});

// pre save to hash the otp
userSchema.pre("save", async function (next) {
  //only run this function if OTP is actually is modified
  if (!this.isModified("otp")) return next();

  // hash the otp with cost of 12
  this.otp = await bcrypt.hash(this.otp, 12);

  next();
});

// pre save to hash the password
userSchema.pre("save", async function (next) {
  //only run this function if OTP is actually is modified
  if (!this.isModified("password")) return next();

  // hash the otp with cost of 12
  this.password = await bcrypt.hash(this.password, 12);

  next();
});

// correctPassword
userSchema.methods.correctPassword = async function (
  candidatePassword, //password got form the frontend
  userPassword // the enc
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// correctOTP
userSchema.methods.correctOTP = async function (
  candidateOTP, //password got form the frontend
  userOTP // the enc
) {
  return await bcrypt.compare(candidateOTP, userOTP);
};

// createPasswordResetToken
userSchema.methods.createPasswordResetToken = async function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 mins for token to expire

  return resetToken;
};

// correctOTP
userSchema.methods.changedPasswordAfterTokenChanged = async function (
  timestamp
) {
  return timestamp < this.passwordChangedAt;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
