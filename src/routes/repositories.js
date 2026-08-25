import { Router } from "express";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { findRelatedIssues } from "../services/analysis.js";
import {
  getIssueComments,
  getIssueTimeline,
  getRepositoryIssues,
  getRepositoryReleases,
} from "../services/github.js";
import { generateIssueAnalysis } from "../services/groq.js";

export const repositoriesRouter = Router();
const REPOSITORY_PART = /^[a-z0-9_.-]+$/i;
const analysisLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maximum: 10,
});

function validateRequest(owner, repository, title, description) {
  if (!REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(repository)) {
    return "Invalid GitHub owner or repository name";
  }
  if (typeof title !== "string" || typeof description !== "string" ||
      !title.trim() || !description.trim()) {
    return "Title and description are required";
  }
  if (title.length > 200 || description.length > 10_000) {
    return "Title or description is too long";
  }
  return null;
}

// Supporting evidence is helpful but should not break the whole analysis when
// one optional GitHub endpoint is unavailable or rate-limited.
async function optionalEvidence(request) {
  try {
    return await request;
  } catch {
    return [];
  }
}

// Fetch a normalized list of issues for one GitHub repository.
repositoriesRouter.get("/:owner/:repository/issues", async (request, response) => {
  try {
    const { owner, repository } = request.params;
    if (!REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(repository)) {
      return response.status(400).json({
        error: "Invalid GitHub owner or repository name",
      });
    }
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

// Retrieve repository evidence and ask Groq for a grounded GenAI analysis.
repositoriesRouter.post("/:owner/:repository/analyze", analysisLimiter, async (request, response) => {
  try {
    const { owner, repository } = request.params;
    const { title, description } = request.body;
    const validationError = validateRequest(owner, repository, title, description);

    if (validationError) {
      return response.status(400).json({
        error: validationError,
      });
    }

    const issues = await getRepositoryIssues(owner, repository);
    // Three strong candidates keep API fan-out and the LLM prompt small.
    const relatedIssues = findRelatedIssues(issues, title, description, 3);

    // Fetch discussions in parallel so five issue requests do not block one by one.
    const [enrichedIssues, releases] = await Promise.all([
      Promise.all(relatedIssues.map(async (issue) => {
        const [discussion, timeline] = await Promise.all([
          optionalEvidence(getIssueComments(
            owner,
            repository,
            issue.number,
          )),
          optionalEvidence(getIssueTimeline(
            owner,
            repository,
            issue.number,
          )),
        ]);
        return { ...issue, discussion, timeline };
      })),
      optionalEvidence(getRepositoryReleases(owner, repository)),
    ]);
    const generated = await generateIssueAnalysis(
      title,
      description,
      enrichedIssues,
      releases,
    );

    return response.json({
      repository: `${owner}/${repository}`,
      issuesAnalyzed: issues.length,
      issueCounts: {
        open: issues.filter((issue) => issue.state === "open").length,
        closed: issues.filter((issue) => issue.state === "closed").length,
      },
      relatedIssues: enrichedIssues,
      releases,
      optimization: {
        githubIssuesScanned: issues.length,
        evidenceIssuesEnriched: enrichedIssues.length,
        groqResponseCached: generated.cached,
      },
      ...generated,
    });
  } catch (error) {
    return response.status(error.status || 500).json({
      error: error.message || "Unexpected server error",
    });
  }
});
