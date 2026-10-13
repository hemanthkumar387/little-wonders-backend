
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
  }),
);

app.use(express.json({ limit: "100kb" }));

// Resend email API
const resend = new Resend(process.env.RESEND_API_KEY);

const recipientEmail = process.env.EMAIL_USER;

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

// Helpers for formatting order details
const formatMoney = (amount) =>
  `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatOptionValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Not specified";
  }

  if (Array.isArray(value)) {
    return value.map(formatOptionValue).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key}: ${formatOptionValue(nestedValue)}`)
      .join("; ");
  }

  return String(value);
};

// Include every selected option in the email.
function formatSelectedOptions(item) {
  const selectedOptions =
    item.selectedOptions &&
    typeof item.selectedOptions === "object" &&
    !Array.isArray(item.selectedOptions)
      ? item.selectedOptions
      : {};

  const optionEntries = Object.entries(selectedOptions).filter(
    ([, value]) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0),
  );

  if (optionEntries.length > 0) {
    return optionEntries
      .map(
        ([key, value]) =>
          `   ${key}: ${formatOptionValue(value)}`,
      )
      .join("\n");
  }

  // Fallback for products using variant labels.
  if (typeof item.variantLabel === "string" && item.variantLabel.trim()) {
    return item.variantLabel
      .split(" | ")
      .map((option) => `   ${option.trim()}`)
      .join("\n");
  }

  // Fallback for products using an option summary.
  if (typeof item.optionSummary === "string" && item.optionSummary.trim()) {
    return item.optionSummary
      .split(" | ")
      .map((option) => `   ${option.trim()}`)
      .join("\n");
  }

  return "   No custom options selected";
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

    // Validate customer details
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

    // Validate and preserve product customizations.
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
      const productName =
        typeof item.name === "string" ? item.name.trim() : "";

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

      const variantLabel =
        typeof item.variantLabel === "string"
          ? item.variantLabel.slice(0, 1000)
          : "";

      const optionSummary =
        typeof item.optionSummary === "string"
          ? item.optionSummary.slice(0, 1000)
          : "";

      safeItems.push({
        productId: item.productId ?? "N/A",
        name: productName,
        quantity,
        price,
        subtotal: price * quantity,
        selectedOptions,
        variantLabel,
        optionSummary,
      });
    }

    // Calculate the total on the backend.
    const serverTotal = safeItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    // Format each product with all available customization details.
    const itemsText = safeItems
      .map(
        (item, index) => `
${index + 1}. ${item.name}
===================================
Product ID: ${item.productId}
Quantity: ${item.quantity}
Unit Price: ${formatMoney(item.price)}
Subtotal: ${formatMoney(item.subtotal)}

SELECTED OPTIONS
${formatSelectedOptions(item)}

Variant Label: ${item.variantLabel || "Not specified"}
Option Summary: ${item.optionSummary || "Not specified"}
`,
      )
      .join("\n");

    const totalQuantity = safeItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const orderText = `
NEW ORDER REQUEST - LITTLEWONDERS
=================================

CUSTOMER DETAILS
---------------------------------
Name: ${name}
Phone: ${phone}
Email: ${email || "Not provided"}

DELIVERY ADDRESS
---------------------------------
${address}
${city} - ${pincode}

ADDITIONAL INSTRUCTIONS
---------------------------------
${notes || "None"}

ORDER ITEMS
=================================
${itemsText}

ORDER SUMMARY
---------------------------------
Different products: ${safeItems.length}
Total quantity: ${totalQuantity}
Estimated total: ${formatMoney(serverTotal)}
---------------------------------

This is an order request, not a confirmed order or payment.
Please contact the customer to confirm product availability,
customization details, delivery information, and the final amount.
`;

    await sendEmail({
      subject: `New LittleWonders Order Request - ${name}`,
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

    return res.status(500).json({
      success: false,
      message: "We couldn't send your order request. Please try again later.",
    });
  }
});

// Health-check endpoint
app.get("/", (req, res) => {
  res.status(200).send("LittleWonders email API is running.");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`LittleWonders backend is running on port ${PORT}`);
});
