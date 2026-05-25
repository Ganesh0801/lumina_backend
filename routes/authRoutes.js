const express = require('express');
const router  = express.Router();
const {
  sendOTP, verifyOTP, register, login,
  getProfile, updateProfile, changePassword,
  forgotPassword, verifyResetOTP, resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Registration flow
router.post('/send-otp',    sendOTP);
router.post('/verify-otp',  verifyOTP);
router.post('/register',    register);

// Login
router.post('/login', login);

// Forgot / reset password flow
router.post('/forgot-password',      forgotPassword);
router.post('/verify-reset-otp',     verifyResetOTP);
router.post('/reset-password',       resetPassword);

// Protected
router.get('/profile',          protect, getProfile);
router.put('/profile',          protect, updateProfile);
router.put('/change-password',  protect, changePassword);

module.exports = router;
