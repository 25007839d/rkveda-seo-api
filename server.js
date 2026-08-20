require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "RKVeda SEO API", version: "1.0.0" });
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1 AS db_ok");
    res.json({ status: "ok", api: "running", database: "connected" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "error", api: "running", database: "disconnected" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RKVeda SEO API running on port ${PORT}`));