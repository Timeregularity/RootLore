import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { repositoriesRouter } from "./routes/repositories.js";

export const app = express();

// Global middleware enables browser requests and parses incoming JSON bodies.
app.use(cors({
  origin(origin, callback) {
    // Chrome extensions have their own protected origin scheme. The API still
    // applies validation and per-IP rate limits to extension requests.
    if (!origin || origin.startsWith("chrome-extension://") || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json());

// Lightweight endpoint used by development and deployment health checks.
app.get("/health", (request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/repositories", repositoriesRouter);

// Return JSON for unknown endpoints instead of Express's default HTML response.
app.use((request, response) => {
  response.status(404).json({ error: "Route not found" });
});

// Convert middleware and malformed-JSON errors into consistent API responses.
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  return response.status(error.type === "entity.parse.failed" ? 400 : 403).json({
    error: error.type === "entity.parse.failed" ? "Invalid JSON body" : error.message,
  });
});
