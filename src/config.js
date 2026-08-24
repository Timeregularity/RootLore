import "dotenv/config";

// Centralized runtime settings; the token is optional for public repositories.
export const config = {
  port: Number(process.env.PORT) || 3000,
  githubToken: process.env.GITHUB_TOKEN || "",
};
