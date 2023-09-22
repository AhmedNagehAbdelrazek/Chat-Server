exports.verifyOTP = catchAsync(async (req, res, next) => {
    // verify otp and update user accordingly
    const { email, otp } = req.body;
    const user = await User.findOne({
      email,
      otp_expiry_time: { $gt: Date.now() },
    });
  
    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "Email is invalid or OTP expired",
      });
    }
  
    if (user.verified) {
      return res.status(400).json({
        status: "error",
        message: "Email is already verified",
      });
    }
  
    if (!(await user.correctOTP(otp, user.otp))) {
      res.status(400).json({
        status: "error",
        message: "OTP is incorrect",
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
      message: "OTP verified Successfully!",
      token,
      user_id: user._id,
    });
  });