import cors from "cors";
import express from "express";
import { repositoriesRouter } from "./routes/repositories.js";

export const app = express();

// Global middleware enables browser requests and parses incoming JSON bodies.
app.use(cors());
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
