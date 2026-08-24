import { config } from "../config.js";

const GITHUB_API_URL = "https://api.github.com";

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

export async function getRepositoryIssues(owner, repository) {
  // Construct the API URL safely from user-provided repository names.
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
    GITHUB_API_URL,
  );

  url.searchParams.set("state", "all");
  url.searchParams.set("per_page", "30");

  const response = await fetch(url, { headers: createHeaders() });
  const data = await response.json();

  if (!response.ok) {
    const message = data.message || "GitHub request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  // GitHub's issues endpoint also returns pull requests. Exclude and normalize them here.
  return data
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
}
