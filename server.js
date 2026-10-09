
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { Resend } = require("resend");

dotenv.config();

const app = express();

const allowedOrigins = [
  "https://little-wonders-seven.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "100kb" }));

// Resend email API
const resend = new Resend(process.env.RESEND_API_KEY);

// Recipient inbox: your Gmail address or another inbox.
const recipientEmail = process.env.EMAIL_USER;

// Use a verified domain for production.
// The fallback is for Resend's permitted test emails only.
const senderEmail =
  process.env.EMAIL_FROM || "LittleWonders <onboarding@resend.dev>";

// Shared email helper
async function sendEmail({ subject, text, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!recipientEmail) {
    throw new Error("EMAIL_USER recipient is not configured.");
  }

  const { data, error } = await resend.emails.send({
    from: senderEmail,
    to: [recipientEmail],
    subject,
    text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    const emailError = new Error(error.message || "Resend email failed.");
    emailError.code = error.name || "RESEND_ERROR";
    throw emailError;
  }

  return data;
}

// Contact form email API
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all fields.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (
      cleanName.length > 100 ||
      cleanEmail.length > 254 ||
      cleanSubject.length > 200 ||
      cleanMessage.length > 10000 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please check your contact details and try again.",
      });
    }

    await sendEmail({
      subject: `Contact Form: ${cleanSubject}`,
      replyTo: cleanEmail,
      text: `
NEW CONTACT MESSAGE - LITTLEWONDERS
===================================

Name: ${cleanName}
Email: ${cleanEmail}
Subject: ${cleanSubject}

Message:
${cleanMessage}
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Your message has been sent successfully!",
    });
  } catch (error) {
    console.error("Contact email error:", {
      message: error.message,
      code: error.code,
    });

    return res.status(500).json({
      success: false,
      message: "Unable to send your message. Please try again later.",
    });
  }
});

// Checkout / order request email API
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

    if (
      customer.name.length > 100 ||
      customer.address.length > 500 ||
      customer.city.length > 100 ||
      (typeof customer.notes === "string" && customer.notes.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Some customer details are too long.",
      });
    }

    const phone = customer.phone.trim();
    const pincode = customer.pincode.trim();
    const email =
      typeof customer.email === "string" ? customer.email.trim() : "";

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

    if (
      email &&
      (email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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

    // Validate and normalize submitted item details.
    const safeItems = items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const name =
        typeof item.name === "string" ? item.name.trim() : "";

      if (
        !name ||
        name.length > 200 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000 ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 10000000
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

    const serverTotal = safeItems.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

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
          `   Subtotal: ${formatMoney(item.subtotal)}`
      )
      .join("\n\n");

    const orderText = `
NEW ORDER REQUEST - LITTLEWONDERS
=================================

CUSTOMER DETAILS

Name: ${customer.name.trim()}
Phone: ${phone}
Email: ${email || "Not provided"}

DELIVERY ADDRESS

${customer.address.trim()}
${customer.city.trim()} - ${pincode}

ADDITIONAL INSTRUCTIONS

${typeof customer.notes === "string" && customer.notes.trim()
  ? customer.notes.trim()
  : "None"}

ORDER ITEMS

${itemsText}

---------------------------------
TOTAL ITEMS: ${safeItems.reduce((sum, item) => sum + item.quantity, 0)}
ESTIMATED TOTAL: ${formatMoney(serverTotal)}
---------------------------------

This is an order request, not a confirmed order or payment.
Please contact the customer to confirm availability, delivery
details, and the final amount.
`;

    await sendEmail({
      subject: `New LittleWonders Order Request - ${customer.name.trim()}`,
      replyTo: email || undefined,
      text: orderText,
    });

    return res.status(200).json({
      success: true,
      message:
        "Your order request has been sent successfully. We'll get in touch with you soon!",
    });
  } catch (error) {
    console.error("Checkout email error:", {
      message: error.message,
      code: error.code,
    });

    // Invalid cart data is a client error, not an email-server error.
    if (error.message === "The cart contains invalid item details.") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "We couldn't send your order request. Please try again later.",
    });
  }
});

// Optional health-check endpoint
app.get("/", (req, res) => {
  res.status(200).send("LittleWonders email API is running.");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`LittleWonders backend is running on port ${PORT}`);
});
