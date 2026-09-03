require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const projectRoutes = require("./routes/project.routes");
const keywordRoutes = require("./routes/keyword.routes");
const rankingRoutes = require("./routes/ranking.routes");
const auditRoutes = require("./routes/audit.routes");
const competitorRoutes = require("./routes/competitor.routes");
const backlinkRoutes = require("./routes/backlink.routes");
const app = express();
const googleSearchConsoleRoutes = require("./routes/googleSearchConsole.routes");
const googleAnalyticsRoutes = require("./routes/googleAnalytics.routes");
const unifiedSeoRoutes = require("./routes/unifiedSeo.routes");
const googleBusinessProfileRoutes = require("./routes/googleBusinessProfile.routes");
const socialIntelligenceRoutes = require("./routes/socialIntelligence.routes");
app.use(cors());
app.use(express.json({ strict: false, limit: "1mb" }));
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", keywordRoutes);
app.use("/api", rankingRoutes);
app.use("/api", auditRoutes);
app.use("/api", competitorRoutes);
app.use("/api", backlinkRoutes);
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
app.use(
    "/api",
    googleSearchConsoleRoutes,
    googleAnalyticsRoutes
);
app.use("/api", unifiedSeoRoutes);
app.use("/api", googleBusinessProfileRoutes);
app.use("/api", socialIntelligenceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RKVeda SEO API running on port ${PORT}`));