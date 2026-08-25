import { config } from "../config.js";

const GITHUB_API_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;
const ISSUE_CACHE_MS = 5 * 60 * 1000;
const MAX_ISSUE_PAGES = 3;
const issueCache = new Map();

// Build standard GitHub headers and authenticate when a token is configured.
function createHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RootLore",
  };

  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  return headers;
}

// Centralize network handling so every GitHub call has a timeout and a useful
// error instead of exposing Node's vague "fetch failed" message.
async function githubRequest(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: createHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const error = new Error(
      cause.name === "TimeoutError"
        ? "GitHub request timed out"
        : "Unable to reach the GitHub API",
    );
    error.status = 503;
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const message = remaining === "0"
      ? "GitHub API rate limit exceeded"
      : data.message || "GitHub request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function getRepositoryIssues(owner, repository) {
  const cacheKey = `${owner}/${repository}`.toLowerCase();
  const cached = issueCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < ISSUE_CACHE_MS) {
    return cached.issues;
  }

  const records = [];
  for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
    const url = new URL(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
      GITHUB_API_URL,
    );
    url.searchParams.set("state", "all");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageRecords = await githubRequest(url);
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
  }

  // GitHub's issues endpoint also returns pull requests. Exclude and normalize them here.
  const issues = records
    .filter((item) => !item.pull_request)
    .map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      author: issue.user?.login ?? "unknown",
      labels: issue.labels.map((label) => label.name),
      comments: issue.comments,
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));

  issueCache.set(cacheKey, { issues, savedAt: Date.now() });
  return issues;
}

// Fetch a small number of comments for one selected issue. RootLore calls this
// only for related issues, rather than downloading every repository comment.
export async function getIssueComments(owner, repository, issueNumber) {
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}/comments`,
    GITHUB_API_URL,
  );
  url.searchParams.set("per_page", "20");

  const data = await githubRequest(url);

  return data.map((comment) => ({
    id: comment.id,
    author: comment.user?.login ?? "unknown",
    body: comment.body,
    url: comment.html_url,
    createdAt: comment.created_at,
  }));
}

// Timeline events reveal closing commits and pull requests linked to an issue.
export async function getIssueTimeline(owner, repository, issueNumber) {
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}/timeline`,
    GITHUB_API_URL,
  );
  url.searchParams.set("per_page", "100");

  const data = await githubRequest(url);

  return data
    .filter((event) => event.commit_id || event.source?.issue?.pull_request)
    .map((event) => ({
      event: event.event,
      commitId: event.commit_id || null,
      commitUrl: event.commit_url || null,
      linkedPullRequest: event.source?.issue?.pull_request
        ? {
            number: event.source.issue.number,
            title: event.source.issue.title,
            url: event.source.issue.html_url,
          }
        : null,
    }));
}

// Recent releases help the model connect a confirmed fix to a published version.
export async function getRepositoryReleases(owner, repository) {
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases`,
    GITHUB_API_URL,
  );
  url.searchParams.set("per_page", "10");

  const data = await githubRequest(url);

  return data.map((release) => ({
    id: release.id,
    name: release.name || release.tag_name,
    tag: release.tag_name,
    body: release.body,
    url: release.html_url,
    publishedAt: release.published_at,
  }));
}
