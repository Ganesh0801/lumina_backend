// Cart is managed on the frontend (localStorage) for speed.
// This route validates cart items against real stock before checkout.
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect } = require('../middleware/authMiddleware');

// Validate cart items (check stock/prices)
router.post('/validate', protect, async (req, res) => {
  try {
    const { items } = req.body;
    const validated = [];
    let hasIssue = false;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        validated.push({ ...item, error: 'Product no longer available' });
        hasIssue = true;
      } else if (product.stock < item.quantity) {
        validated.push({ ...item, availableStock: product.stock, error: `Only ${product.stock} left in stock` });
        hasIssue = true;
      } else {
        validated.push({ ...item, currentPrice: product.price, name: product.name, image: product.images[0] });
      }
    }

    res.json({ validated, hasIssue });
  } catch (err) {
    res.status(500).json({ message: 'Validation failed' });
  }
});

module.exports = router;
