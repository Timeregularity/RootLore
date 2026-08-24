import { Router } from "express";
import { getRepositoryIssues } from "../services/github.js";

export const repositoriesRouter = Router();

// Fetch a normalized list of issues for one GitHub repository.
repositoriesRouter.get("/:owner/:repository/issues", async (request, response) => {
  try {
    const { owner, repository } = request.params;
    const issues = await getRepositoryIssues(owner, repository);

    response.json({
      repository: `${owner}/${repository}`,
      count: issues.length,
      issues,
    });
  } catch (error) {
    // Preserve GitHub status codes so the frontend can explain failures.
    response.status(error.status || 500).json({
      error: error.message || "Unexpected server error",
    });
  }
});
