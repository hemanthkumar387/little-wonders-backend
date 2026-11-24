const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();

// ==================== CORS CONFIGURATION ====================

const normalizeOrigin = (origin = "") =>
  origin.trim().replace(/\/+$/, "");

const allowedOrigins = [
  "https://little-wonders-seven.vercel.app",
  "https://www.littlewonders04.shop",
  "https://littlewonders04.shop",
  "https://admin.littlewonders04.shop",
  "http://localhost:5173",
  ...(process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map(normalizeOrigin)
    : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, normalizedOrigin);
    }

    console.error("CORS rejected origin:", origin);

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },

  credentials: true,

  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ],

  optionsSuccessStatus: 204,
};

// Register CORS once, before all routes and middleware.
// This middleware also handles OPTIONS preflight requests.
app.use(cors(corsOptions));

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With"],
  }),
);
// ==================== REQUEST ORIGIN PROTECTION ====================

// Protect browser requests that can change server data.
// Requests from unapproved browser origins are rejected.
app.use((req, res, next) => {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  const origin = req.get("Origin");

  if (origin && !allowedOrigins.includes(normalizeOrigin(origin))) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed.",
    });
  }

  next();
});

// ==================== COOKIE CONFIGURATION ====================

// Keep SameSite=None while the frontend and backend are hosted
// on different sites, such as Vercel and Render domains.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
};

const CUSTOMER_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const ADMIN_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 8 * 60 * 60 * 1000,
};

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
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
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
    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Partially Paid", "Paid"],
      default: "Unpaid",
    },
    amountPaid: {
      type: Number,
      default: 0,
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

// ==================== REVIEW MODEL ====================

const reviewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    product: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number.",
      },
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
      index: true,
    },
  },
  { timestamps: true },
);

const Review = mongoose.model("Review", reviewSchema, "reviews");

// ==================== EXPENSE MODEL ====================

const expenseSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      max: 10000000,
    },
    person: {
      type: String,
      required: true,
      enum: ["Hasini", "Pravallika"],
    },
  },
  { timestamps: true },
);

const Expense = mongoose.model("Expense", expenseSchema, "expenses");

// ==================== FINANCIAL SETTINGS MODEL ====================

const financialSettingSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: "financial-summary",
    },
    totalReceived: {
      type: Number,
      default: 0,
      min: 0,
      max: 1000000000,
    },
  },
  { timestamps: true },
);

const FinancialSetting = mongoose.model(
  "FinancialSetting",
  financialSettingSchema,
  "financialsettings",
);

// ==================== ORDER AND CONTACT MODELS ====================

const Order = mongoose.model("Order", orderSchema, "orders");

const ContactMessage = mongoose.model(
  "ContactMessage",
  contactSchema,
  "contacts",
);

// ==================== CUSTOMER MODEL ====================

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 254,
      default: undefined,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^[6-9]\d{9}$/,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

// Only enforce email uniqueness when an email string exists.
// This allows multiple customers to register without an email.
customerSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  },
);

const Customer = mongoose.model("Customer", customerSchema, "customers");

// ==================== VALIDATION HELPERS ====================

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==================== CUSTOMER AUTHENTICATION ====================

function requireCustomer(req, res, next) {
  const token = req.cookies?.customerToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);

    if (
      payload.role !== "customer" ||
      !payload.customerId ||
      !mongoose.isValidObjectId(payload.customerId)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid customer session. Please log in again.",
      });
    }

    req.customerId = payload.customerId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again.",
    });
  }
}

// ==================== ADMIN AUTHENTICATION ====================

function requireAdmin(req, res, next) {
  const token = req.cookies?.adminToken;

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
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Your admin session expired. Please log in again.",
    });
  }
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

    if (
      cleanName.length > 100 ||
      cleanMessage.length > 1500 ||
      cleanSubject.length > 200
    ) {
      return res.status(400).json({
        success: false,
        message: "Some fields exceed the allowed length.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit Indian mobile number.",
      });
    }

    if (cleanEmail && (cleanEmail.length > 254 || !validEmail(cleanEmail))) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address or leave it empty.",
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

// ==================== PUBLIC REVIEW APIs ====================

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({
      status: "Approved",
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({
      success: true,
      reviews: reviews.map((review) => ({
        id: review._id,
        name: review.name,
        product: review.product,
        rating: review.rating,
        message: review.message,
        date: review.createdAt,
        status: review.status,
      })),
    });
  } catch (error) {
    console.error("Fetch reviews error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load customer reviews.",
    });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const { name, product, rating, message } = req.body || {};

    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanProduct = typeof product === "string" ? product.trim() : "";
    const cleanMessage = typeof message === "string" ? message.trim() : "";
    const numericRating = Number(rating);

    if (!cleanName || !cleanProduct || !cleanMessage || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "Please complete all required review fields.",
      });
    }

    if (cleanName.length > 100 || cleanProduct.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name and product name must not exceed 100 characters.",
      });
    }

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid rating between 1 and 5.",
      });
    }

    if (cleanMessage.length < 10 || cleanMessage.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Review must contain between 10 and 1000 characters.",
      });
    }

    const review = await Review.create({
      name: cleanName,
      product: cleanProduct,
      rating: numericRating,
      message: cleanMessage,
      status: "Pending",
    });

    return res.status(201).json({
      success: true,
      message: "Thank you! Your review has been submitted for approval.",
      review: {
        id: review._id,
        name: review.name,
        product: review.product,
        rating: review.rating,
        message: review.message,
        date: review.createdAt,
        status: review.status,
      },
    });
  } catch (error) {
    console.error("Submit review error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to submit your review. Please try again later.",
    });
  }
});

// ==================== CUSTOMER SIGNUP ====================

app.post("/api/customer/signup", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";

    if (
      !cleanName ||
      !cleanPhone ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete all required fields.",
      });
    }

    if (cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Your name must not exceed 100 characters.",
      });
    }

    if (cleanEmail && !validEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (cleanEmail.length > 254) {
      return res.status(400).json({
        success: false,
        message: "Email address is too long.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit Indian mobile number.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must contain 8–72 characters.",
      });
    }

    const existingPhone = await Customer.findOne({
      phone: cleanPhone,
    });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message:
          "An account already exists with this mobile number. Please log in.",
      });
    }

    if (cleanEmail) {
      const existingEmail = await Customer.findOne({
        email: cleanEmail,
      });

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: "An account already exists with this email. Please log in.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const customer = await Customer.create({
      name: cleanName,
      email: cleanEmail || undefined,
      phone: cleanPhone,
      password: hashedPassword,
    });

    const token = jwt.sign(
      {
        customerId: customer._id.toString(),
        role: "customer",
      },
      process.env.CUSTOMER_JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("customerToken", token, CUSTOMER_COOKIE_OPTIONS);

    return res.status(201).json({
      success: true,
      message: "Your LittleWonders account has been created!",
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account already exists with these details. Please log in.",
      });
    }

    console.error("Customer signup error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create your account. Please try again.",
    });
  }
});

// ==================== CUSTOMER LOGIN ====================

app.post("/api/customer/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (
      typeof identifier !== "string" ||
      !identifier.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email/mobile number and password.",
      });
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();
    const isPhone = /^[6-9]\d{9}$/.test(normalizedIdentifier);

    const customer = await Customer.findOne(
      isPhone
        ? { phone: normalizedIdentifier }
        : { email: normalizedIdentifier },
    ).select("+password");

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/mobile number or password.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, customer.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/mobile number or password.",
      });
    }

    const token = jwt.sign(
      {
        customerId: customer._id.toString(),
        role: "customer",
      },
      process.env.CUSTOMER_JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("customerToken", token, CUSTOMER_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone,
      },
    });
  } catch (error) {
    console.error("Customer login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again.",
    });
  }
});

// ==================== CUSTOMER LOGOUT ====================

app.post("/api/customer/logout", (req, res) => {
  res.clearCookie("customerToken", COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
});

// ==================== GET LOGGED-IN CUSTOMER ====================

app.get("/api/customer/me", requireCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId).lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    return res.json({
      success: true,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone,
      },
    });
  } catch (error) {
    console.error("Customer profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load your account.",
    });
  }
});

// ==================== GET CUSTOMER ORDERS ====================

app.get("/api/customer/orders", requireCustomer, async (req, res) => {
  try {
    const orders = await Order.find({
      customerId: req.customerId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Customer orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load your orders.",
    });
  }
});

// ==================== CHECKOUT API ====================

app.post("/api/checkout", requireCustomer, async (req, res) => {
  try {
    const { customer, items } = req.body || {};

    const loggedInCustomer = await Customer.findById(req.customerId);

    if (!loggedInCustomer) {
      return res.status(401).json({
        success: false,
        message: "Customer account not found. Please log in again.",
      });
    }

    if (
      !customer ||
      typeof customer.address !== "string" ||
      !customer.address.trim() ||
      typeof customer.city !== "string" ||
      !customer.city.trim() ||
      typeof customer.pincode !== "string" ||
      !customer.pincode.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide your complete delivery address.",
      });
    }

    const address = customer.address.trim();
    const city = customer.city.trim();
    const pincode = customer.pincode.trim();
    const notes =
      typeof customer.notes === "string" ? customer.notes.trim() : "";

    if (
      address.length > 500 ||
      city.length > 100 ||
      pincode.length !== 6 ||
      notes.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Some delivery details are invalid or too long.",
      });
    }

    if (!/^[0-9]{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 6-digit PIN code.",
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
      if (!item || typeof item !== "object" || Array.isArray(item)) {
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

    if (!Number.isFinite(total) || total > 1000000000) {
      return res.status(400).json({
        success: false,
        message: "The order total is invalid.",
      });
    }

    const savedOrder = await Order.create({
      customerId: loggedInCustomer._id,
      customer: {
        name: loggedInCustomer.name,
        phone: loggedInCustomer.phone,
        email: loggedInCustomer.email || "",
        address,
        city,
        pincode,
        notes,
      },
      items: safeItems,
      total,
      paymentStatus: "Unpaid",
      amountPaid: 0,
      status: "Pending",
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

// ==================== ADMIN EXPENSE APIs ====================

app.get("/api/admin/expenses", requireAdmin, async (req, res) => {
  try {
    const [expenses, settings] = await Promise.all([
      Expense.find().sort({ createdAt: -1 }).limit(1000).lean(),
      FinancialSetting.findById("financial-summary").lean(),
    ]);

    return res.json({
      success: true,
      expenses,
      totalReceived: settings?.totalReceived || 0,
    });
  } catch (error) {
    console.error("Admin expenses error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load expenses.",
    });
  }
});

app.post("/api/admin/expenses", requireAdmin, async (req, res) => {
  try {
    const { itemName, price, person } = req.body || {};
    const cleanName = typeof itemName === "string" ? itemName.trim() : "";
    const numericPrice = Number(price);

    if (
      !cleanName ||
      cleanName.length > 200 ||
      price === "" ||
      price === null ||
      price === undefined ||
      !Number.isFinite(numericPrice) ||
      numericPrice <= 0 ||
      numericPrice > 10000000 ||
      !["Hasini", "Pravallika"].includes(person)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid item name, price and person.",
      });
    }

    const expense = await Expense.create({
      itemName: cleanName,
      price: numericPrice,
      person,
    });

    return res.status(201).json({
      success: true,
      message: "Expense added successfully.",
      expense,
    });
  } catch (error) {
    console.error("Add expense error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to add expense.",
    });
  }
});

app.delete("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID.",
      });
    }

    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found.",
      });
    }

    return res.json({
      success: true,
      message: "Expense deleted successfully.",
    });
  } catch (error) {
    console.error("Delete expense error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete expense.",
    });
  }
});

// ==================== ADMIN ORDER PAYMENT API ====================

app.patch("/api/admin/orders/:id/payment", requireAdmin, async (req, res) => {
  try {
    const { amountPaid } = req.body || {};

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (
      amountPaid === "" ||
      amountPaid === null ||
      amountPaid === undefined ||
      !Number.isFinite(Number(amountPaid))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount received.",
      });
    }

    const numericAmount = Number(Number(amountPaid).toFixed(2));

    if (numericAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount received cannot be negative.",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const orderTotal = Number(order.total) || 0;

    if (numericAmount > orderTotal) {
      return res.status(400).json({
        success: false,
        message: "Amount received cannot exceed the order total.",
      });
    }

    let paymentStatus = "Unpaid";

    if (numericAmount >= orderTotal && orderTotal > 0) {
      paymentStatus = "Paid";
    } else if (numericAmount > 0) {
      paymentStatus = "Partially Paid";
    }

    order.amountPaid = numericAmount;
    order.paymentStatus = paymentStatus;

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment details updated successfully.",
      order,
    });
  } catch (error) {
    console.error("Update payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update payment details.",
    });
  }
});

// ==================== TOTAL RECEIVED API ====================

app.patch("/api/admin/expenses/received", requireAdmin, async (req, res) => {
  try {
    const { amountToAdd } = req.body || {};
    const amount = Number(amountToAdd);

    if (
      amountToAdd === "" ||
      amountToAdd === null ||
      amountToAdd === undefined ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount.",
      });
    }

    const settings = await FinancialSetting.findByIdAndUpdate(
      "financial-summary",
      {
        $inc: { totalReceived: amount },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      success: true,
      message: "Amount added successfully.",
      totalReceived: settings.totalReceived,
    });
  } catch (error) {
    console.error("Add received amount error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to add received amount.",
    });
  }
});

// ==================== ADMIN REVIEW APIs ====================

app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error("Admin reviews error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load reviews.",
    });
  }
});

app.patch("/api/admin/reviews/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review status.",
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID.",
      });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Review ${status.toLowerCase()} successfully.`,
      review,
    });
  } catch (error) {
    console.error("Update review status error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update review status.",
    });
  }
});

app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID.",
      });
    }

    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    console.error("Delete review error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete review.",
    });
  }
});

// ==================== ADMIN LOGIN ====================

app.post("/api/admin/login", async (req, res) => {
  try {
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
        // Use bcrypt when a hashed password is configured.
        passwordMatches = await bcrypt.compare(
          password,
          process.env.ADMIN_PASSWORD_HASH,
        );
      } else if (process.env.ADMIN_PASSWORD) {
        // Use direct comparison for a plain-text password.
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

    res.cookie("adminToken", token, ADMIN_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Admin login successful.",
      username: process.env.ADMIN_USERNAME,
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again.",
    });
  }
});

// ==================== ADMIN LOGOUT ====================

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("adminToken", COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    message: "Admin logged out successfully.",
  });
});

// ==================== ADMIN ORDER APIs ====================

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

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Completed", "Cancelled"];

  if (!allowed.includes(req.body?.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order status.",
    });
  }

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

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
    console.error("Update order status error:", error.message);

    return res.status(400).json({
      success: false,
      message: "Could not update order status.",
    });
  }
});

// ==================== ADMIN CONTACT APIs ====================

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

app.patch("/api/admin/messages/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["Unread", "Read", "Replied"];

  if (!allowed.includes(req.body?.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid message status.",
    });
  }

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID.",
      });
    }

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
    console.error("Update message status error:", error.message);

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
  const requiredEnvironmentVariables = [
    "MONGODB_URI",
    "CUSTOMER_JWT_SECRET",
    "ADMIN_JWT_SECRET",
  ];

  const missingVariables = requiredEnvironmentVariables.filter(
    (key) => !process.env[key],
  );

  if (missingVariables.length > 0) {
    console.error(
      `Missing required environment variables: ${missingVariables.join(", ")}`,
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
