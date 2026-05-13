const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

// Get all products (public)
exports.getProducts = async (req, res) => {
  try {
    const { category, search, sort, minPrice, maxPrice, page = 1, limit = 12, featured, isActive } = req.query;
    const query = {};

    // Admin can pass isActive='' to get all; public gets only active
    if (isActive === '') {
      // no filter — admin viewing all
    } else {
      query.isActive = true;
    }

    if (category) query.category = category;
    if (featured) query.isFeatured = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc') sortObj = { price: 1 };
    if (sort === 'price_desc') sortObj = { price: -1 };
    if (sort === 'rating') sortObj = { rating: -1 };
    if (sort === 'popular') sortObj = { numReviews: -1 };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortObj)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

// Get single product
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('reviews.user', 'name');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product' });
  }
};

// Add review
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const alreadyReviewed = product.reviews.find(r => r.user.toString() === req.user._id.toString());
    if (alreadyReviewed) return res.status(400).json({ message: 'Already reviewed' });

    product.reviews.push({ user: req.user._id, name: req.user.name, rating, comment });
    product.numReviews = product.reviews.length;
    product.rating = product.reviews.reduce((a, r) => a + r.rating, 0) / product.reviews.length;
    await product.save();

    res.json({ message: 'Review added' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add review' });
  }
};

// ADMIN: Create product (multipart/form-data with image files)
exports.createProduct = async (req, res) => {
  try {
    const body = req.body;

    // New files uploaded via multer
    const uploadedImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

    // Parse JSON fields sent as strings from FormData
    const parseList = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()).filter(Boolean); }
    };

    const parseSpec = (val) => {
      if (!val) return {};
      try { return JSON.parse(val); } catch { return {}; }
    };

    const product = await Product.create({
      name: body.name,
      description: body.description,
      price: Number(body.price),
      originalPrice: body.originalPrice ? Number(body.originalPrice) : undefined,
      category: body.category,
      stock: Number(body.stock) || 0,
      colors: parseList(body.colors),
      tags: parseList(body.tags),
      isFeatured: body.isFeatured === 'true' || body.isFeatured === true,
      isActive: body.isActive !== 'false' && body.isActive !== false,
      specifications: parseSpec(body.specifications),
      images: uploadedImages,
    });

    res.status(201).json({ message: 'Product created', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product' });
  }
};

// ADMIN: Update product (supports new file uploads + keeping existing URLs)
exports.updateProduct = async (req, res) => {
  try {
    const body = req.body;

    const parseList = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()).filter(Boolean); }
    };

    const parseSpec = (val) => {
      if (!val) return {};
      try { return JSON.parse(val); } catch { return {}; }
    };

    // Existing image URLs passed from frontend (kept images)
    let existingImages = parseList(body.existingImages);

    // New files uploaded
    const newImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

    const allImages = [...existingImages, ...newImages];

    const updateData = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.price !== undefined && { price: Number(body.price) }),
      ...(body.originalPrice !== undefined && { originalPrice: body.originalPrice ? Number(body.originalPrice) : undefined }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.stock !== undefined && { stock: Number(body.stock) }),
      ...(body.colors !== undefined && { colors: parseList(body.colors) }),
      ...(body.tags !== undefined && { tags: parseList(body.tags) }),
      ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured === 'true' || body.isFeatured === true }),
      ...(body.isActive !== undefined && { isActive: body.isActive !== 'false' && body.isActive !== false }),
      ...(body.specifications !== undefined && { specifications: parseSpec(body.specifications) }),
      ...(allImages.length > 0 && { images: allImages }),
    };

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product updated', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update product' });
  }
};

// ADMIN: Delete product (also removes uploaded image files)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Clean up uploaded image files
    if (product.images && product.images.length > 0) {
      product.images.forEach(imgPath => {
        if (imgPath.startsWith('/uploads/')) {
          const fullPath = path.join(__dirname, '..', imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
      });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product' });
  }
};
