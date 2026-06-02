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
      Product.find({ stock: { $lt: 5, $gt: 0 }, isActive: true }).select('name stock images').limit(10)
    ]);

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

// All orders — with working search
exports.getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 15, search } = req.query;
    const query = {};
    if (status) query.status = status;

    // Search by orderNumber or populate-matched user name/email handled via aggregation
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      // Find users matching search
      const matchingUsers = await User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }]
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);
      query.$or = [
        { orderNumber: searchRegex },
        { user: { $in: userIds } }
      ];
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error(err);
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

    if (status === 'shipped' && !order.estimatedDelivery) {
      const est = new Date();
      est.setDate(est.getDate() + 5);
      order.estimatedDelivery = est;
    }

    await order.save();

    // Send email notification (non-blocking)
    if (order.user?.email) {
      sendOrderStatusEmail(order.user.email, order.user.name, order).catch(() => {});
    }

    res.json({ message: `Order updated to ${status}`, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update order' });
  }
};

// All users
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const total = await User.countDocuments({ role: 'user' });
    const users = await User.find({ role: 'user' })
      .select('-password -otp')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // Attach order stats per user
    const userIds = users.map(u => u._id);
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', totalOrders: { $sum: 1 }, totalSpent: { $sum: '$total' } } }
    ]);
    const statsMap = Object.fromEntries(orderStats.map(s => [s._id.toString(), s]));

    const usersWithStats = users.map(u => ({
      ...u.toObject(),
      totalOrders: statsMap[u._id.toString()]?.totalOrders || 0,
      totalSpent:  statsMap[u._id.toString()]?.totalSpent  || 0,
    }));

    res.json({ users: usersWithStats, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// User details
exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -otp');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const orders = await Order.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(20);
    res.json({ user, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

// Financials — fixed: backend now returns `monthly` field
exports.getFinancials = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    const matchStage = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [report, monthly, daily] = await Promise.all([
      Order.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } }
      ]),
      Order.aggregate([
        { $match: { ...matchStage, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$total' },
          count: { $sum: 1 }
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Order.aggregate([
        { $match: { ...matchStage, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({ report, monthly, daily });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate report' });
  }
};
