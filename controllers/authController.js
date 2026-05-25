const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../config/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Step 1: Send OTP to email
exports.sendOTP = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ message: 'Name, email, and phone are required' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    let user = await User.findOne({ email });
    if (user && user.isVerified && user.password) {
      return res.status(400).json({ message: 'Email already registered. Please login.' });
    }

    if (!user) {
      user = new User({ name, email, phone, password: 'temp', otp, otpExpiry });
    } else {
      user.name = name;
      user.phone = phone;
      user.otp = otp;
      user.otpExpiry = otpExpiry;
    }
    await user.save();
    await sendOTPEmail(email, name, otp);

    res.json({ message: 'OTP sent to your email', userId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

// Step 2: Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otpExpiry) return res.status(400).json({ message: 'OTP expired' });

    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'OTP verified successfully', email });
  } catch (err) {
    res.status(500).json({ message: 'OTP verification failed' });
  }
};

// Step 3: Complete registration
exports.register = async (req, res) => {
  try {
    const { email, password, confirmPassword, address } = req.body;

    if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Please verify OTP first' });

    const hashed = await bcrypt.hash(password, 12);
    user.password = hashed;
    user.address = address;
    user.isVerified = true;
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, address: user.address }
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.isVerified) return res.status(401).json({ message: 'Invalid credentials or account not verified' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user._id);
    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, address: user.address, phone: user.phone }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
};

// Get profile
exports.getProfile = async (req, res) => {
  res.json(req.user);
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, address },
      { new: true }
    ).select('-password -otp');
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Update failed' });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ message: 'Current password is wrong' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to change password' });
  }
};

// Forgot Password - Step 1: send reset OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isVerified) {
      // Don't reveal if email exists
      return res.json({ message: 'If this email exists, a reset code has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

    const { sendPasswordResetEmail } = require('../config/email');
    await sendPasswordResetEmail(user.email, user.name, otp);

    res.json({ message: 'Password reset code sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to send reset email' });
  }
};

// Forgot Password - Step 2: verify OTP
exports.verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otpExpiry) return res.status(400).json({ message: 'OTP expired. Please request a new one.' });

    // Don't clear OTP yet — needed for reset step
    res.json({ message: 'OTP verified. Set your new password.' });
  } catch (err) {
    res.status(500).json({ message: 'OTP verification failed' });
  }
};

// Forgot Password - Step 3: reset password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) return res.status(400).json({ message: 'All fields required' });
    if (newPassword !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid session. Please start over.' });
    if (new Date() > user.otpExpiry) return res.status(400).json({ message: 'Session expired. Please start over.' });

    user.password = await require('bcryptjs').hash(newPassword, 12);
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Password reset failed' });
  }
};
