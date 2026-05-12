const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { placeOrder, getUserOrders, getOrder, rateOrder, cancelOrder } = require('../controllers/orderController');

router.post('/', protect, placeOrder);
router.get('/my', protect, getUserOrders);
router.get('/:id', protect, getOrder);
router.post('/:id/rate', protect, rateOrder);
router.put('/:id/cancel', protect, cancelOrder);

module.exports = router;
