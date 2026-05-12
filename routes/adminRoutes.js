const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { getDashboard, getAllOrders, updateOrderStatus, getAllUsers, getUserDetail, getFinancials } = require('../controllers/adminController');

router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);
router.get('/orders', getAllOrders);
router.put('/orders/:id/status', updateOrderStatus);
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetail);
router.get('/financials', getFinancials);

module.exports = router;
