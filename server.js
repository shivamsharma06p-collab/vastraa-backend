// server.js
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // npm i node-fetch@2
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

// ensure files exist
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));

// allow frontend origin (adjust origin if deploying)
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

const readJSON = (f) => {
  try { return JSON.parse(fs.readFileSync(f,"utf8")||"[]"); } catch(e) { return []; }
};
const writeJSON = (f, data) => fs.writeFileSync(f, JSON.stringify(data, null, 2));

const uid = (p="") => p + Math.random().toString(36).slice(2,9);

// nodemailer (optional)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

// health
app.get("/ping", (req, res) => res.json({ ok: true, time: Date.now() }));

// GET orders (admin)
app.get("/api/orders", (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.json({ ok: true, orders });
});

// POST create order
app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    // basic validation
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok:false, error:"no items provided" });
    }
    const order = {
      id: uid("ORD_"),
      items: body.items,
      total: Number(body.total || 0),
      paymentMethod: body.paymentMethod || "COD",
      status: body.paymentMethod === "COD" ? "processing" : "pending_payment",
      createdAt: Date.now(),
      customer: body.customer || {},
      meta: body.meta || {},
    };

    // persist
    const orders = readJSON(ORDERS_FILE);
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);

    // notify admin (non-blocking)
    if (process.env.ADMIN_EMAIL && transporter) {
      transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@example.com",
        to: process.env.ADMIN_EMAIL,
        subject: `New Order ${order.id}`,
        text: `New order ${order.id} total: ${order.total}`,
      }).catch(err => console.warn("mail failed", err && err.message));
    }

    // If paymentMethod is UPI, create upi link
    if (order.paymentMethod === "UPI") {
      const upiId = process.env.MERCHANT_UPI_ID || "shivamsharma.spg@okhdfcbank";
      const merchantName = process.env.MERCHANT_NAME || "VASTRAA WEARS";
      const amount = (order.total || 0).toFixed(2);
      // UPI deep link format
      const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(amount)}&tn=${encodeURIComponent(`Order ${order.id}`)}&cu=INR`;
      return res.json({ ok:true, order, upiLink });
    }

    return res.json({ ok:true, order });
  } catch (e) {
    console.error("order create error:", e);
    return res.status(500).json({ ok:false, error: e.message || "server error" });
  }
});

// Update order status (admin)
app.post("/api/orders/:id/status", (req,res) => {
  const id = req.params.id;
  const { status, note } = req.body;
  const orders = readJSON(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ ok:false, error:"not found" });
  orders[idx].status = status || orders[idx].status;
  if (note) orders[idx].note = note;
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok:true, order: orders[idx] });
});

// Reviews - GET
app.get("/api/reviews", (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  // newest first
  reviews.sort((a,b)=>b.createdAt - a.createdAt);
  res.json({ ok:true, reviews });
});

// Reviews - POST (permanent)
app.post("/api/reviews", (req, res) => {
  try {
    const { name, rating, comment } = req.body || {};
    if (!name || !comment) return res.status(400).json({ ok:false, error:"name & comment required" });
    const reviews = readJSON(REVIEWS_FILE);
    const rev = { id: uid("REV_"), name, rating: Number(rating || 5), comment, createdAt: Date.now() };
    reviews.unshift(rev);
    writeJSON(REVIEWS_FILE, reviews);
    return res.json({ ok:true, review: rev });
  } catch (e) {
    console.error("review error", e);
    return res.status(500).json({ ok:false, error: e.message || "server error" });
  }
});

// Admin views (simple)
app.get("/admin/orders", (req,res) => {
  const orders = readJSON(ORDERS_FILE);
  res.send(`<html><body><h1>Orders (${orders.length})</h1><pre>${JSON.stringify(orders,null,2)}</pre></body></html>`);
});
app.get("/admin/reviews", (req,res) => {
  const reviews = readJSON(REVIEWS_FILE);
  res.send(`<html><body><h1>Reviews (${reviews.length})</h1><pre>${JSON.stringify(reviews,null,2)}</pre></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log("Make sure .env is configured. /api/orders accepts POST and /api/reviews stores reviews.");
});
