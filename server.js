// server.js
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
const DATA_DIR = __dirname;
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

// Make sure JSON files exist
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, "[]");

// Allow frontend origin (update if deployed)
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Helper functions
const readJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
  } catch {
    return [];
  }
};
const writeJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

const uid = (prefix = "") =>
  prefix + Math.random().toString(36).substring(2, 9);

// Email setup (optional)
let transporter;
try {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
} catch {
  console.log("⚠️ Mail not configured, skipping email setup.");
}

// ✅ TEST ROUTE (to confirm backend is live)
app.get("/api/test", (req, res) => {
  res.send("✅ Vastraa Backend is Live & Working Perfectly!");
});

// 🟢 Ping check
app.get("/ping", (req, res) => res.json({ ok: true, time: Date.now() }));

// 🛒 GET Orders
app.get("/api/orders", (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.json({ ok: true, orders });
});

// 🧾 POST Create Order
app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok: false, error: "No items provided" });
    }

    const order = {
      id: uid("ORD_"),
      items: body.items,
      total: Number(body.total || 0),
      paymentMethod: body.paymentMethod || "COD",
      status: body.paymentMethod === "COD" ? "processing" : "pending_payment",
      createdAt: Date.now(),
      customer: body.customer || {},
    };

    const orders = readJSON(ORDERS_FILE);
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);

    // Send email (optional)
    if (process.env.ADMIN_EMAIL && transporter) {
      transporter.sendMail({
        from: process.env.SMTP_FROM || "no-reply@vastraa.com",
        to: process.env.ADMIN_EMAIL,
        subject: `New Order: ${order.id}`,
        text: `New order placed: ₹${order.total}\nOrder ID: ${order.id}`,
      });
    }

    // UPI Payment link
    if (order.paymentMethod === "UPI") {
      const upiId = process.env.MERCHANT_UPI_ID || "shivamsharma.spg@okhdfcbank";
      const merchantName = process.env.MERCHANT_NAME || "VASTRAA WEARS";
      const amount = (order.total || 0).toFixed(2);
      const upiLink = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${amount}&tn=Order%20${order.id}&cu=INR`;
      return res.json({ ok: true, order, upiLink });
    }

    res.json({ ok: true, order });
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// 🟣 Update order status
app.post("/api/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ ok: false, error: "Not found" });
  order.status = status || order.status;
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, order });
});

// ⭐ GET Reviews
app.get("/api/reviews", (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  reviews.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, reviews });
});

// 📝 POST Review
app.post("/api/reviews", (req, res) => {
  const { name, rating, comment } = req.body || {};
  if (!name || !comment)
    return res.status(400).json({ ok: false, error: "Name & comment required" });
  const reviews = readJSON(REVIEWS_FILE);
  const newReview = {
    id: uid("REV_"),
    name,
    rating: Number(rating || 5),
    comment,
    createdAt: Date.now(),
  };
  reviews.unshift(newReview);
  writeJSON(REVIEWS_FILE, reviews);
  res.json({ ok: true, review: newReview });
});

// 🧠 Simple admin views
app.get("/admin/orders", (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.send(
    `<h2>Orders (${orders.length})</h2><pre>${JSON.stringify(
      orders,
      null,
      2
    )}</pre>`
  );
});
app.get("/admin/reviews", (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  res.send(
    `<h2>Reviews (${reviews.length})</h2><pre>${JSON.stringify(
      reviews,
      null,
      2
    )}</pre>`
  );
});

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
