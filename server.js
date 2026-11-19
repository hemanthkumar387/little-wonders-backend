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
  "https://www.littlewonders04.shop",
  "https://admin.littlewonders04.shop/",
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

// Store expenses in the expenses collection.
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

// Explicit MongoDB collection names
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
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
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

const Customer = mongoose.model("Customer", customerSchema, "customers");

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

// ==================== CUSTOMER AUTHENTICATION ====================

function requireCustomer(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);

    if (payload.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access required.",
      });
    }

    req.customerId = payload.customerId;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again.",
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
      !cleanEmail ||
      !cleanPhone ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete all required fields.",
      });
    }

    if (cleanName.length > 100 || !validEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter valid name and email details.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must contain 8–72 characters.",
      });
    }

    const existingCustomer = await Customer.findOne({
      email: cleanEmail,
    });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: "An account already exists with this email. Please log in.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const customer = await Customer.create({
      name: cleanName,
      email: cleanEmail,
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

    return res.status(201).json({
      success: true,
      message: "Your LittleWonders account has been created!",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account already exists with this email.",
      });
    }

    console.error("Customer signup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create your account. Please try again.",
    });
  }
});

// ==================== CUSTOMER LOGIN ====================

app.post("/api/customer/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!cleanEmail || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please enter your email and password.",
      });
    }

    const customer = await Customer.findOne({
      email: cleanEmail,
    }).select("+password");

    if (!customer || !(await bcrypt.compare(password, customer.password))) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password.",
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

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });
  } catch (error) {
    console.error("Customer login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again.",
    });
  }
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
        email: customer.email,
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

// ==================== CHECKOUT API ====================

// ==================== CHECKOUT API ====================

app.post("/api/checkout", requireCustomer, async (req, res) => {
  try {
    const { customer, items } = req.body || {};

    // 1. Verify the logged-in customer
    const loggedInCustomer = await Customer.findById(req.customerId);

    if (!loggedInCustomer) {
      return res.status(401).json({
        success: false,
        message: "Customer account not found. Please log in again.",
      });
    }

    // 2. Validate delivery details
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
      typeof customer.notes === "string"
        ? customer.notes.trim()
        : "";

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

    // 3. Validate cart items
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 100
    ) {
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

      const productName =
        typeof item.name === "string"
          ? item.name.trim()
          : "";

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

    // 4. Calculate order total on the backend
    const total = safeItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    if (!Number.isFinite(total) || total > 1000000000) {
      return res.status(400).json({
        success: false,
        message: "The order total is invalid.",
      });
    }

    // 5. Save the order using authenticated customer details
    const savedOrder = await Order.create({
      customer: {
        name: loggedInCustomer.name,
        phone: loggedInCustomer.phone,
        email: loggedInCustomer.email,
        address,
        city,
        pincode,
        notes,
      },

      items: safeItems,

      total,

      status: "Pending",
    });

    // 6. Send success response
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
      message:
        "We couldn't save your order request. Please try again later.",
    });
  }
});

// ==================== ADMIN EXPENSE APIs ====================

// Get all expenses and financial settings
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

// Add a new expense
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

// Delete an expense
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

// Add amount to total received
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

    const settings = await FinancialSetting.findByIdAndReplace(
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
