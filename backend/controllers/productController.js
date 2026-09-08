const Product = require("../models/Product");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

// GET /api/products (admin) — full shop/inventory list
exports.listProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/products/public (PUBLIC) — the storefront reads this without
// logging in. Every product is listed (including out-of-stock ones, so
// buyers can still see what the shop carries); imagePublicId is internal
// Cloudinary bookkeeping and left out.
exports.listPublicProducts = async (req, res) => {
  try {
    const products = await Product.find().select("-imagePublicId").sort({ name: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/products (admin, multipart/form-data: name, price, stock, unit, image)
exports.createProduct = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const price = Number(req.body.price);
    const stock = req.body.stock !== undefined && req.body.stock !== "" ? Number(req.body.stock) : 0;
    const unit = (req.body.unit || "pcs").trim() || "pcs";

    if (!name) return res.status(400).json({ message: "Product name is required" });
    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({ message: "Enter a valid price" });
    }
    if (Number.isNaN(stock) || stock < 0) {
      return res.status(400).json({ message: "Enter a valid stock quantity" });
    }
    if (!req.files?.image?.[0]) {
      return res.status(400).json({ message: "Product photo is required" });
    }

    const { url, publicId } = await uploadBufferToCloudinary(req.files.image[0].buffer, {
      folder: "athlete-verify/products",
      resourceType: "image",
    });

    const product = await Product.create({
      name,
      price,
      stock,
      unit,
      imageUrl: url,
      imagePublicId: publicId,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/products/:id (admin) — edit name/price/stock/unit/photo. Also used
// by the quick ± stock steppers, which just send { stock } as plain JSON
// (multer no-ops on a non-multipart request, so that keeps working here).
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (name) product.name = name;
    }
    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (Number.isNaN(price) || price < 0) {
        return res.status(400).json({ message: "Enter a valid price" });
      }
      product.price = price;
    }
    if (req.body.stock !== undefined) {
      const stock = Number(req.body.stock);
      if (Number.isNaN(stock) || stock < 0) {
        return res.status(400).json({ message: "Enter a valid stock quantity" });
      }
      product.stock = stock;
    }
    if (req.body.unit !== undefined) {
      const unit = req.body.unit.trim();
      if (unit) product.unit = unit;
    }

    if (req.files?.image?.[0]) {
      const oldPublicId = product.imagePublicId;
      const { url, publicId } = await uploadBufferToCloudinary(req.files.image[0].buffer, {
        folder: "athlete-verify/products",
        resourceType: "image",
      });
      product.imageUrl = url;
      product.imagePublicId = publicId;
      if (oldPublicId) {
        cloudinary.uploader
          .destroy(oldPublicId)
          .catch((err) => console.warn("Old product photo cleanup failed:", err.message));
      }
    }

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/products/:id (admin)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.imagePublicId) {
      cloudinary.uploader
        .destroy(product.imagePublicId)
        .catch((err) => console.warn("Product photo cleanup failed:", err.message));
    }
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
