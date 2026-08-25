import "dotenv/config";

// Centralized runtime settings; the token is optional for public repositories.
export const config = {
  port: Number(process.env.PORT) || 3000,
  githubToken: process.env.GITHUB_TOKEN || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:5183")
    .split(",")
    .map((origin) => origin.trim()),
};
