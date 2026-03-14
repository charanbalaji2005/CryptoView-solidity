// backend/server.js  — ES Module syntax (matches "type": "module" in package.json)
import express    from "express";
import mongoose   from "mongoose";
import cors       from "cors";
import dotenv     from "dotenv";
import { createRequire } from "module";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

// ── MongoDB Connection ────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/nexuswallet")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ═══════════════════════════════════════════════════════════
//  SCHEMAS & MODELS
// ═══════════════════════════════════════════════════════════

// ── Token sub-schema ──────────────────────────────────────
const TokenSchema = new mongoose.Schema(
  {
    contractAddress: { type: String, default: "native" },
    name:            { type: String, required: true },
    symbol:          { type: String, required: true },
    decimals:        { type: Number, default: 18 },
    balance:         { type: String, required: true },
    isNative:        { type: Boolean, default: false },
    logo:            { type: String, default: "" },
    usdValue:        { type: String, default: "" },
  },
  { _id: false }
);

// ── Wallet schema — one doc per (address + chainId) ───────
const WalletSchema = new mongoose.Schema({
  address: {
    type:      String,
    required:  true,
    lowercase: true,
    trim:      true,
  },
  chainId: {
    type:     String,   // hex string e.g. "0x1"
    required: true,
  },
  chainIdDec:   { type: Number },
  networkName:  { type: String,  default: "" },
  nativeCurrency: { type: String, default: "ETH" },
  nativeBalance:  { type: String, default: "0" },
  tokens: [TokenSchema],

  // Permission / connection metadata
  permissionGrantedAt: { type: Date, default: null },
  lastConnectedAt:     { type: Date, default: Date.now },
  connectionCount:     { type: Number, default: 1 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Compound unique index: one document per wallet + network
WalletSchema.index({ address: 1, chainId: 1 }, { unique: true });

const Wallet = mongoose.model("Wallet", WalletSchema);

// ── Connection log schema — every connect event ────────────
const ConnectionLogSchema = new mongoose.Schema({
  address:     { type: String, required: true, lowercase: true },
  chainId:     { type: String, required: true },
  networkName: { type: String, default: "" },
  event:       { type: String, default: "connect" }, // connect | disconnect | refresh
  timestamp:   { type: Date,   default: Date.now },
  userAgent:   { type: String, default: "" },
});

const ConnectionLog = mongoose.model("ConnectionLog", ConnectionLogSchema);

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

// ── POST /api/wallet/connect ───────────────────────────────
// Called right after MetaMask permission is granted.
// Creates or updates the wallet record and logs the event.
app.post("/api/wallet/connect", async (req, res) => {
  try {
    const {
      address,
      chainId,
      chainIdDec,
      networkName,
      nativeCurrency,
      permissionGrantedAt,
    } = req.body;

    if (!address || !chainId) {
      return res.status(400).json({ error: "address and chainId are required" });
    }

    const addr = address.toLowerCase();

    const wallet = await Wallet.findOneAndUpdate(
      { address: addr, chainId },
      {
        $set: {
          chainIdDec,
          networkName:         networkName     ?? "",
          nativeCurrency:      nativeCurrency  ?? "ETH",
          permissionGrantedAt: permissionGrantedAt
            ? new Date(permissionGrantedAt)
            : new Date(),
          lastConnectedAt: new Date(),
          updatedAt:       new Date(),
        },
        $inc:         { connectionCount: 1 },
        $setOnInsert: { address: addr, chainId, createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    await ConnectionLog.create({
      address:     addr,
      chainId,
      networkName: networkName ?? "",
      event:       "connect",
      userAgent:   req.headers["user-agent"] ?? "",
    });

    res.status(200).json({ success: true, wallet });
  } catch (err) {
    console.error("POST /api/wallet/connect error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/wallet/balances ──────────────────────────────
// Saves the full portfolio (native coin + ERC-20 tokens).
app.post("/api/wallet/balances", async (req, res) => {
  try {
    const { address, chainId, nativeBalance, tokens } = req.body;

    if (!address || !chainId) {
      return res.status(400).json({ error: "address and chainId are required" });
    }

    const addr = address.toLowerCase();

    const wallet = await Wallet.findOneAndUpdate(
      { address: addr, chainId },
      {
        $set: {
          nativeBalance: nativeBalance ?? "0",
          tokens:        tokens        ?? [],
          updatedAt:     new Date(),
        },
      },
      { new: true }
    );

    if (!wallet) {
      return res
        .status(404)
        .json({ error: "Wallet not found. Call /api/wallet/connect first." });
    }

    res.status(200).json({ success: true, wallet });
  } catch (err) {
    console.error("POST /api/wallet/balances error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/wallet/:address ───────────────────────────────
// All network records for a wallet address.
app.get("/api/wallet/:address", async (req, res) => {
  try {
    const addr    = req.params.address.toLowerCase();
    const wallets = await Wallet.find({ address: addr }).sort({ lastConnectedAt: -1 });

    if (!wallets.length) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    res.status(200).json({ success: true, wallets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/wallet/:address/:chainId ─────────────────────
// One specific wallet + network record.
app.get("/api/wallet/:address/:chainId", async (req, res) => {
  try {
    const addr    = req.params.address.toLowerCase();
    const chainId = req.params.chainId;

    const wallet = await Wallet.findOne({ address: addr, chainId });
    if (!wallet) {
      return res.status(404).json({ error: "Record not found" });
    }
    res.status(200).json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/wallets ───────────────────────────────────────
// List all wallets ever connected (admin view).
app.get("/api/wallets", async (req, res) => {
  try {
    const wallets = await Wallet.find({})
      .sort({ lastConnectedAt: -1 })
      .limit(100);
    res.status(200).json({ success: true, count: wallets.length, wallets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/logs/:address ─────────────────────────────────
// Connection history for an address.
app.get("/api/logs/:address", async (req, res) => {
  try {
    const logs = await ConnectionLog.find({
      address: req.params.address.toLowerCase(),
    })
      .sort({ timestamp: -1 })
      .limit(50);
    res.status(200).json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/wallet/:address ────────────────────────────
// Remove all records for a wallet.
app.delete("/api/wallet/:address", async (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    await Wallet.deleteMany({ address: addr });
    await ConnectionLog.deleteMany({ address: addr });
    res.status(200).json({ success: true, message: "Wallet data deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health ────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mongo:  mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    time:   new Date().toISOString(),
  });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 NexusWallet backend running on http://localhost:${PORT}`);
});