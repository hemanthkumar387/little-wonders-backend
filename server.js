const express = require("express");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

const allowedOrigins = ["https://little-wonders-seven.vercel.app"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as server-to-server requests.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Contact form email API
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all fields.",
      });
    }

    const mailOptions = {
      from: `"Website Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `Contact Form: ${subject}`,
      text: `
Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: "Your message has been sent successfully!",
    });
  } catch (error) {
    console.error("Checkout email error:", {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "We couldn't send your order request. Please try again later.",
    });
  }
});

// Checkout / order request email API
app.post("/api/checkout", async (req, res) => {
  try {
    const { customer, items, total } = req.body || {};

    if (
      !customer ||
      !customer.name?.trim() ||
      !customer.phone?.trim() ||
      !customer.address?.trim() ||
      !customer.city?.trim() ||
      !customer.pincode?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required customer details.",
      });
    }

    if (!/^[0-9]{10}$/.test(customer.phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit phone number.",
      });
    }

    if (!/^[0-9]{6}$/.test(customer.pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 6-digit PIN code.",
      });
    }

    if (
      customer.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
    ) {
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

    // Validate and normalize item details on the server.
    const safeItems = items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const name = String(item.name || "").trim();

      if (
        !name ||
        name.length > 200 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000 ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        throw new Error("The cart contains invalid item details.");
      }

      return {
        name,
        quantity,
        price,
        subtotal: price * quantity,
      };
    });

    // Calculate the total on the server rather than trusting the browser.
    const serverTotal = safeItems.reduce((sum, item) => sum + item.subtotal, 0);

    const formatMoney = (amount) =>
      `Rs. ${Number(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    const itemsText = safeItems
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}\n` +
          `   Quantity: ${item.quantity}\n` +
          `   Unit price: ${formatMoney(item.price)}\n` +
          `   Subtotal: ${formatMoney(item.subtotal)}`,
      )
      .join("\n\n");

    const mailOptions = {
      from: `"LittleWonders Orders" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: customer.email?.trim() || undefined,
      subject: `New LittleWonders Order Request - ${customer.name.trim()}`,
      text: `
NEW ORDER REQUEST - LITTLEWONDERS
=================================

CUSTOMER DETAILS

Name: ${customer.name.trim()}
Phone: ${customer.phone.trim()}
Email: ${customer.email?.trim() || "Not provided"}

DELIVERY ADDRESS

${customer.address.trim()}
${customer.city.trim()} - ${customer.pincode.trim()}

ADDITIONAL INSTRUCTIONS

${customer.notes?.trim() || "None"}

ORDER ITEMS

${itemsText}

---------------------------------
TOTAL ITEMS: ${safeItems.reduce((sum, item) => sum + item.quantity, 0)}
ESTIMATED TOTAL: ${formatMoney(serverTotal)}
---------------------------------

This is a customer order request. Please contact the customer
to confirm availability, delivery details, and the final amount.
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message:
        "Your order request has been sent successfully. We'll get in touch with you soon!",
    });
  } catch (error) {
    console.error("Checkout email error:", error.message);

    return res.status(500).json({
      success: false,
      message: "We couldn't send your order request. Please try again later.",
    });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Email server running on port 5000");
});
