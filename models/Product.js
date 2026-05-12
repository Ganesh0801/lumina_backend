const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  discount: { type: Number, default: 0 },
  category: { type: String, enum: ['pendant', 'table', 'wall', 'ceiling', 'floor', 'outdoor', 'smart', 'other'], required: true },
  images: [{ type: String }],
  colors: [{ type: String }],
  stock: { type: Number, default: 0 },
  sku: { type: String, unique: true },
  rating: { type: Number, default: 0 },
  numReviews: { type: Number, default: 0 },
  reviews: [reviewSchema],
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tags: [String],
  specifications: {
    material: String,
    wattage: String,
    bulbType: String,
    dimensions: String,
    weight: String,
    voltage: String
  }
}, { timestamps: true });

// Auto-generate SKU
productSchema.pre('save', function(next) {
  if (!this.sku) {
    this.sku = 'LUM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  if (this.originalPrice && this.price) {
    this.discount = Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
