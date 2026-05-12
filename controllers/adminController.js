const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendOrderStatusEmail } = require('../config/email');

// Dashboard stats
exports.getDashboard = async (req, res) => {
  try {
    const [totalUsers, totalOrders, totalProducts, revenueData, recentOrders, pendingOrders, lowStock] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Order.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' }, avg: { $avg: '$total' } } }
      ]),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email'),
      Order.countDocuments({ status: 'pending' }),
      Product.find({ stock: { $lt: 5, $gt: 0 } }).select('name stock')
    ]);

    // Monthly revenue for chart
    const monthlyRevenue = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'refunded'] }, createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const statusBreakdown = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      stats: {
        totalUsers,
        totalOrders,
        totalProducts,
        totalRevenue: revenueData[0]?.total || 0,
        avgOrderValue: revenueData[0]?.avg || 0,
        pendingOrders,
        lowStockCount: lowStock.length
      },
      recentOrders,
      monthlyRevenue,
      statusBreakdown,
      lowStock
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Dashboard error' });
  }
};

// All orders
exports.getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (status) query.status = status;

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const trackingMessages = {
      confirmed: 'Order has been confirmed and is being prepared',
      processing: 'Your items are being packed',
      shipped: 'Order has been shipped and is on the way',
      delivered: 'Order has been delivered successfully',
      cancelled: 'Order has been cancelled',
      refunded: 'Refund has been initiated'
    };

    order.status = status;
    order.adminNote = adminNote || order.adminNote;
    order.tracking.push({ status, message: trackingMessages[status] || `Status updated to ${status}` });

    if (status === 'delivered') {
      order.deliveredAt = new Date();
      order.paymentStatus = 'paid';
    }

    if (status === 'shipped') {
      order.estimatedDelivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    }

    await order.save();
    await sendOrderStatusEmail(order.user.email, order.user.name, order.orderNumber, status);

    res.json({ message: `Order ${status} successfully`, order });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order' });
  }
};

// All users
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await User.countDocuments({ role: 'user' });
    const users = await User.find({ role: 'user' })
      .select('-password -otp')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// User details
exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -otp');
    const orders = await Order.find({ user: req.params.id }).sort({ createdAt: -1 });
    res.json({ user, orders });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

// Profit/loss report
exports.getFinancials = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const matchStage = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const report = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$total' },
          deliveryRevenue: { $sum: '$deliveryCharge' }
        }
      }
    ]);

    const daily = await Order.aggregate([
      { $match: { ...matchStage, status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({ report, daily });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate report' });
  }
};
