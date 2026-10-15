const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();

// ==================== CORS CONFIGURATION ====================

const allowedOrigins = [
  "https://little-wonders-seven.vercel.app",
  ...(process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "100kb" }));

// ==================== ORDER MODEL ====================

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.Mixed,
      default: "N/A",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      max: 10000000,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    variantKey: {
      type: String,
      default: "",
    },
    variantLabel: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    optionSummary: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    selectedOptions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        default: "",
        trim: true,
        maxlength: 254,
      },
      address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
      },
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      pincode: {
        type: String,
        required: true,
        trim: true,
        maxlength: 6,
      },
      notes: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500,
      },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => items.length > 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Completed", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

// ==================== CONTACT MODEL ====================

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^[6-9]\d{9}$/,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      maxlength: 254,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },
    status: {
      type: String,
      enum: ["Unread", "Read", "Replied"],
      default: "Unread",
    },
  },
  { timestamps: true },
);

// Explicit MongoDB collection names
const Order = mongoose.model("Order", orderSchema, "orders");

const ContactMessage = mongoose.model(
  "ContactMessage",
  contactSchema,
  "contacts",
);

// ==================== VALIDATION HELPERS ====================

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validContact(value) {
  const contact = value.trim();

  const isEmail = validEmail(contact);

  // Indian mobile number: 10 digits starting with 6, 7, 8, or 9.
  const isIndianMobile = /^[6-9][0-9]{9}$/.test(contact);

  return isEmail || isIndianMobile;
}

// ==================== CONTACT API ====================

app.post("/api/contact", async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete all required fields.",
      });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (cleanName.length > 100 || cleanMessage.length > 1500) {
      return res.status(400).json({
        success: false,
        message: "Your name or message exceeds the allowed length.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit Indian mobile number.",
      });
    }

    // Email is optional, but must be valid if supplied.
    if (
      cleanEmail &&
      (cleanEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address or leave it empty.",
      });
    }

    if (cleanSubject.length > 200) {
      return res.status(400).json({
        success: false,
        message: "The subject is too long.",
      });
    }

    const savedMessage = await ContactMessage.create({
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
    });

    return res.status(201).json({
      success: true,
      message:
        "Thank you for reaching out! Your message has been saved. We'll get back to you soon.",
      id: savedMessage._id,
    });
  } catch (error) {
    console.error("Contact save error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to save your message right now. Please try again later.",
    });
  }
});

// ==================== CHECKOUT API ====================

app.post("/api/checkout", async (req, res) => {
  try {
    const { customer, items } = req.body || {};

    if (
      !customer ||
      typeof customer.name !== "string" ||
      !customer.name.trim() ||
      typeof customer.phone !== "string" ||
      !customer.phone.trim() ||
      typeof customer.address !== "string" ||
      !customer.address.trim() ||
      typeof customer.city !== "string" ||
      !customer.city.trim() ||
      typeof customer.pincode !== "string" ||
      !customer.pincode.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required customer details.",
      });
    }

    const name = customer.name.trim();
    const phone = customer.phone.trim();
    const address = customer.address.trim();
    const city = customer.city.trim();
    const pincode = customer.pincode.trim();

    const notes =
      typeof customer.notes === "string" ? customer.notes.trim() : "";

    const email =
      typeof customer.email === "string" ? customer.email.trim() : "";

    if (
      name.length > 100 ||
      address.length > 500 ||
      city.length > 100 ||
      pincode.length > 6 ||
      notes.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Some customer details are too long.",
      });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit phone number.",
      });
    }

    if (!/^[0-9]{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 6-digit PIN code.",
      });
    }

    if (email && (email.length > 254 || !validEmail(email))) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Your cart has no valid items.",
      });
    }

    const safeItems = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          success: false,
          message: "One or more order items are invalid.",
        });
      }

      const quantity = Number(item.quantity);
      const price = Number(item.price);

      const productName = typeof item.name === "string" ? item.name.trim() : "";

      if (
        !productName ||
        productName.length > 200 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000 ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 10000000
      ) {
        return res.status(400).json({
          success: false,
          message: "One or more order items are invalid.",
        });
      }

      const selectedOptions =
        item.selectedOptions &&
        typeof item.selectedOptions === "object" &&
        !Array.isArray(item.selectedOptions)
          ? item.selectedOptions
          : {};

      safeItems.push({
        productId: item.productId ?? "N/A",
        name: productName,
        quantity,
        price,
        subtotal: price * quantity,

        variantKey:
          typeof item.variantKey === "string"
            ? item.variantKey.slice(0, 300)
            : "",

        variantLabel:
          typeof item.variantLabel === "string"
            ? item.variantLabel.slice(0, 1000)
            : "",

        optionSummary:
          typeof item.optionSummary === "string"
            ? item.optionSummary.slice(0, 1000)
            : "",

        selectedOptions,
      });
    }

    const total = safeItems.reduce((sum, item) => sum + item.subtotal, 0);

    const savedOrder = await Order.create({
      customer: {
        name,
        phone,
        email,
        address,
        city,
        pincode,
        notes,
      },
      items: safeItems,
      total,
    });

    return res.status(201).json({
      success: true,
      message:
        "Thank you for choosing LittleWonders! Your order request has been saved. We'll get in touch with you soon to confirm the details.",
      orderId: savedOrder._id,
    });
  } catch (error) {
    console.error("Checkout save error:", error.message);

    return res.status(500).json({
      success: false,
      message: "We couldn't save your order request. Please try again later.",
    });
  }
});

// ==================== ADMIN AUTHENTICATION ====================

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Admin login required.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    if (payload.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your admin session expired. Please log in again.",
    });
  }
}

// Admin login
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) ||
    !process.env.ADMIN_JWT_SECRET
  ) {
    return res.status(503).json({
      success: false,
      message: "Admin login is not configured on the server.",
    });
  }

  const usernameMatches =
    typeof username === "string" && username === process.env.ADMIN_USERNAME;

  let passwordMatches = false;

  if (typeof password === "string") {
    if (process.env.ADMIN_PASSWORD_HASH) {
      passwordMatches = await bcrypt.compare(
        password,
        process.env.ADMIN_PASSWORD_HASH,
      );
    } else {
      passwordMatches = password === process.env.ADMIN_PASSWORD;
    }
  }

  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({
      success: false,
      message: "Incorrect username or password.",
    });
  }

  const token = jwt.sign(
    {
      role: "admin",
      username: process.env.ADMIN_USERNAME,
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" },
  );

  return res.json({
    success: true,
    token,
    username: process.env.ADMIN_USERNAME,
  });
});

// ==================== ADMIN ORDER APIs ====================

// Get all orders
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(500).lean();

    return res.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Admin orders error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load orders.",
    });
  }
});

// Update order status
app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Completed", "Cancelled"];

  if (!allowed.includes(req.body?.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order status.",
    });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Could not update order status.",
    });
  }
});

// ==================== ADMIN CONTACT APIs ====================

// Get all contact messages
app.get("/api/admin/messages", requireAdmin, async (req, res) => {
  try {
    const messages = await ContactMessage.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Admin messages error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load contact messages.",
    });
  }
});

// Update contact message status
app.patch("/api/admin/messages/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["Unread", "Read", "Replied"];

  if (!allowed.includes(req.body?.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid message status.",
    });
  }

  try {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    return res.json({
      success: true,
      message,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Could not update message status.",
    });
  }
});

// ==================== HEALTH CHECK ====================

app.get("/", (req, res) => {
  res.status(200).send("LittleWonders API is running.");
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error(
      "MONGODB_URI is missing. Add your MongoDB Atlas connection string to backend .env.",
    );

    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB Atlas.");

    app.listen(PORT, () => {
      console.log(`LittleWonders backend is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    process.exit(1);
  }
}

startServer();
