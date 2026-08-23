const crypto = require("crypto");

const workerAuthMiddleware = (req, res, next) => {
    try {

        const authHeader = req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Worker authorization token required"
            });
        }

        const token = authHeader.substring(7);

        const workerToken = process.env.WORKER_TOKEN;

        if (!workerToken) {

            console.error(
                "WORKER_TOKEN is not configured"
            );

            return res.status(500).json({
                success: false,
                message: "Worker authentication is not configured"
            });
        }

        const tokenBuffer = Buffer.from(token);
        const workerTokenBuffer = Buffer.from(workerToken);

        if (
            tokenBuffer.length !== workerTokenBuffer.length ||
            !crypto.timingSafeEqual(
                tokenBuffer,
                workerTokenBuffer
            )
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid worker token"
            });
        }

        req.worker = true;

        next();

    } catch (error) {

        console.error(
            "Worker authentication error:",
            error
        );

        return res.status(401).json({
            success: false,
            message: "Worker authentication failed"
        });
    }
};

module.exports = workerAuthMiddleware;