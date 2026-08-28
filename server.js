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

// =====================================================
// CORS
// =====================================================

const allowedOrigins = [
    "https://seo.rkveda.in",
];

app.use(
    cors({
        origin: function (origin, callback) {

            // Allow requests without Origin
            // such as PowerShell / server-to-server requests
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error("Not allowed by CORS")
            );
        },

        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS",
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
        ],

        credentials: false,
    })
);

// =====================================================
// BODY PARSER
// =====================================================

app.use(express.json());

// =====================================================
// API ROUTES
// =====================================================

app.use("/api/auth", authRoutes);

app.use("/api/projects", projectRoutes);

app.use("/api", keywordRoutes);

app.use("/api", rankingRoutes);

app.use("/api", auditRoutes);

app.use("/api", competitorRoutes);

app.use("/api", backlinkRoutes);

// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {

    res.json({
        status: "ok",
        service: "RKVeda SEO API",
        version: "1.0.0",
    });

});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", async (req, res) => {

    try {

        await db.query(
            "SELECT 1 AS db_ok"
        );

        res.json({
            status: "ok",
            api: "running",
            database: "connected",
        });

    } catch (error) {

        console.error(
            "Health check error:",
            error.message
        );

        res.status(500).json({

            status: "error",

            api: "running",

            database: "disconnected",

        });

    }

});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {

    console.error(
        "Server error:",
        err.message
    );

    if (err.message === "Not allowed by CORS") {

        return res.status(403).json({
            success: false,
            message: "CORS origin not allowed",
        });

    }

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });

});

// =====================================================
// SERVER
// =====================================================

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {

        console.log(
            `RKVeda SEO API running on port ${PORT}`
        );

    }
);