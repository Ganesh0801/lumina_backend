const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendOrderConfirmEmail, sendOrderStatusEmail } = require('../config/email');

// Place order
exports.placeOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, paymentDetails } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ message: 'No items in order' });

    // Validate stock and compute prices
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) return res.status(404).json({ message: `Product not found: ${item.product}` });
      if (product.stock < item.quantity) return res.status(400).json({ message: `Insufficient stock for ${product.name}` });

      product.stock -= item.quantity;
      await product.save();

      subtotal += product.price * item.quantity;
      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images[0] || '',
        price: product.price,
        quantity: item.quantity,
        color: item.color || ''
      });
    }

    const deliveryCharge = subtotal > 999 ? 0 : 50;
    const total = subtotal + deliveryCharge;

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      shippingAddress,
      paymentMethod,
      paymentDetails: paymentDetails || {},
      paymentStatus: paymentMethod !== 'cod' ? 'paid' : 'pending',
      subtotal,
      deliveryCharge,
      total,
      tracking: [{ status: 'pending', message: 'Order placed successfully' }]
    });

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalOrders: 1, totalSpent: total }
    });

    await sendOrderConfirmEmail(req.user.email, req.user.name, order);

    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to place order' });
  }
};

// Get user orders
exports.getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};

// Get single order
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name images price')
      .populate('user', 'name email phone');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order' });
  }
};

// Rate order
exports.rateOrder = async (req, res) => {
  try {
    const { rating, review } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'delivered') return res.status(400).json({ message: 'Can only rate delivered orders' });

    order.rating = rating;
    order.review = review;
    order.isRated = true;
    await order.save();
    res.json({ message: 'Thank you for your review!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to submit rating' });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ message: 'Cannot cancel this order at this stage' });
    }

    order.status = 'cancelled';
    order.tracking.push({ status: 'cancelled', message: 'Order cancelled by customer' });
    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
    }

    res.json({ message: 'Order cancelled' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to cancel order' });
  }
};
