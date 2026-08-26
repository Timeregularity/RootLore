import { config } from "../config.js";

const GITHUB_API_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;
const ISSUE_CACHE_MS = 15 * 60 * 1000;
const SUPPORTING_EVIDENCE_CACHE_MS = 6 * 60 * 60 * 1000;
const DOCUMENT_CACHE_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
const MAX_ISSUE_PAGES = 1;
const MAX_CACHE_ENTRIES = 500;
const MAX_DOCUMENT_FILES = 20;
const MAX_DOCUMENT_BYTES = 750_000;
const responseCache = new Map();
const inFlightRequests = new Map();

function normalizeIssue(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    stateReason: issue.state_reason || null,
    author: issue.user?.login ?? "unknown",
    labels: (issue.labels || []).map((label) => typeof label === "string" ? label : label.name),
    comments: issue.comments,
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

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
async function githubRequest(url, cacheMs = SUPPORTING_EVIDENCE_CACHE_MS) {
  const cacheKey = String(url);
  const cached = responseCache.get(cacheKey);

  if (cached?.error && Date.now() < cached.expiresAt) throw cached.error;
  // Most requests are served here without consuming a GitHub API request.
  if (cached?.data && Date.now() - cached.savedAt < cacheMs) return cached.data;

  // If several users request the same resource together, share one network call.
  if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

  const request = requestAndCacheGitHub(cacheKey, cached);
  inFlightRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

async function requestAndCacheGitHub(url, cached) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        ...createHeaders(),
        // A stale entry can be revalidated cheaply instead of downloaded again.
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const error = new Error(
      cause.name === "TimeoutError"
        ? "GitHub request timed out"
        : "Unable to reach the GitHub API",
    );
    error.status = 503;
    responseCache.set(url, {
      error,
      expiresAt: Date.now() + FAILURE_CACHE_MS,
      savedAt: Date.now(),
    });
    throw error;
  }

  if (response.status === 304 && cached) {
    cached.savedAt = Date.now();
    return cached.data;
  }

  const data = await response.json();
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const message = remaining === "0"
      ? "GitHub API rate limit exceeded"
      : data.message || "GitHub request failed";
    const error = new Error(message);
    error.status = response.status;
    // Briefly remember failures to prevent many clients hammering an unhealthy
    // or rate-limited endpoint. A short TTL still allows quick recovery.
    responseCache.set(url, {
      error,
      expiresAt: Date.now() + FAILURE_CACHE_MS,
      savedAt: Date.now(),
    });
    throw error;
  }

  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
  responseCache.set(url, {
    data,
    etag: response.headers.get("etag"),
    savedAt: Date.now(),
  });
  return data;
}

export async function getRepositoryIssues(owner, repository) {
  const records = [];
  for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
    const url = new URL(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
      GITHUB_API_URL,
    );
    url.searchParams.set("state", "all");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageRecords = await githubRequest(url, ISSUE_CACHE_MS);
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
  }

  // GitHub's issues endpoint also returns pull requests. Exclude and normalize them here.
  const issues = records
    .filter((item) => !item.pull_request)
    .map(normalizeIssue);

  return issues;
}

// Fetch the issue currently open in the browser even when it is older than the
// recent issue window and does not match GitHub's keyword search.
export async function getRepositoryIssue(owner, repository, issueNumber) {
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${encodeURIComponent(issueNumber)}`,
    GITHUB_API_URL,
  );
  return normalizeIssue(await githubRequest(url));
}

// GitHub search can find older resolved issues outside the recent-100 window.
// Queries are deliberately short and cached to protect the lower search limit.
export async function searchRepositoryIssues(owner, repository, title, description) {
  const terms = buildIssueSearchTerms(title, description);
  if (!terms.length) return [];

  const url = new URL("/search/issues", GITHUB_API_URL);
  url.searchParams.set("q", `repo:${owner}/${repository} is:issue ${terms.join(" ")}`);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "20");
  const data = await githubRequest(url, ISSUE_CACHE_MS);
  return (data.items || []).map(normalizeIssue);
}

export function buildIssueSearchTerms(title, description) {
  const ignored = new Set([
    "after", "and", "are", "does", "error", "fails", "from", "have", "install",
    "issue", "not", "that", "the", "this", "unable", "using", "when", "with",
    "behaviour", "environment", "expected", "actual", "problem", "steps",
  ]);
  const allTerms = [...new Set(`${title} ${description}`.toLowerCase().match(/[a-z0-9_@./-]{3,}/g) || [])]
    .filter((term) => !ignored.has(term) && !term.startsWith("http"))
    .filter((term) => !/^\d{1,2}$/.test(term));
  const signatures = allTerms
    .filter((term) => /\d|_|@/.test(term))
    .sort((first, second) => second.length - first.length)
    .slice(0, 2);
  if (signatures.length) return signatures;

  const titleTerms = [...new Set(title.toLowerCase().match(/[a-z0-9-]{4,}/g) || [])]
    .filter((term) => !ignored.has(term))
    .sort((first, second) => second.length - first.length)
    .slice(0, 2);
  return titleTerms.length ? titleTerms : allTerms.slice(0, 2);
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
    .filter((event) =>
      event.commit_id || event.source?.issue?.pull_request ||
      ["closed", "reopened"].includes(event.event)
    )
    .map((event) => ({
      event: event.event,
      actor: event.actor?.login || null,
      createdAt: event.created_at || null,
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

// Build a bounded repository-documentation cache. RootLore includes root guides
// and documentation folders, but never treats the entire source tree as docs.
// Responses are reused for 24 hours and only ranked passages reach the model.
export async function getRepositoryDocuments(owner, repository) {
  const repositoryUrl = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    GITHUB_API_URL,
  );
  const metadata = await githubRequest(repositoryUrl, DOCUMENT_CACHE_MS);
  const treeUrl = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(metadata.default_branch)}`,
    GITHUB_API_URL,
  );
  treeUrl.searchParams.set("recursive", "1");
  const tree = await githubRequest(treeUrl, DOCUMENT_CACHE_MS);

  const availableDocuments = (tree.tree || [])
    .filter((item) => item.type === "blob" && item.size <= 100_000 && isUsefulDocument(item.path))
    .sort((first, second) => documentPriority(first.path) - documentPriority(second.path));
  const candidates = [];
  let selectedBytes = 0;
  for (const item of availableDocuments) {
    if (candidates.length >= MAX_DOCUMENT_FILES) break;
    if (selectedBytes + item.size > MAX_DOCUMENT_BYTES) continue;
    candidates.push(item);
    selectedBytes += item.size;
  }

  const documents = [];
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const downloaded = await Promise.all(batch.map(async (item) => {
      const blob = await githubRequest(item.url, DOCUMENT_CACHE_MS);
      const content = blob.encoding === "base64"
        ? Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8")
        : String(blob.content || "");
      return {
        path: item.path,
        content: content.slice(0, 100_000),
        sha: item.sha,
        url: `https://github.com/${owner}/${repository}/blob/${metadata.default_branch}/${item.path}`,
      };
    }));
    documents.push(...downloaded);
  }

  return documents;
}

// Retrieve only explicitly referenced source paths. Invalid or missing paths are
// handled by the route as optional evidence and never trigger a repository scan.
export async function getRepositorySourceFile(owner, repository, path) {
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    GITHUB_API_URL,
  );
  const data = await githubRequest(url, DOCUMENT_CACHE_MS);
  if (Array.isArray(data) || data.type !== "file" || data.size > 150_000) return null;

  const content = data.encoding === "base64"
    ? Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8")
    : String(data.content || "");
  return {
    path: data.path || path,
    content: content.slice(0, 150_000),
    sha: data.sha,
    url: data.html_url,
  };
}

function isUsefulDocument(path) {
  const normalized = path.toLowerCase();
  if (!/\.(?:md|mdx|txt|rst)$/.test(normalized)) return false;
  const parts = normalized.split("/");
  const isRootDocument = parts.length === 1;
  const isDocumentationFolder = parts.some((part) =>
    ["docs", "doc", "documentation", "guides", "guide", "wiki"].includes(part)
  );
  const isNamedGuide = /(^|\/)(readme|contributing|changelog|troubleshooting|troubleshoot|faq|install|installation|setup|getting-started|configuration|usage)(?:[._-]|$)/.test(normalized);
  return isRootDocument || isDocumentationFolder || isNamedGuide;
}

function documentPriority(path) {
  const normalized = path.toLowerCase();
  if (/^readme\./.test(normalized)) return 0;
  if (/(troubleshoot|faq)/.test(normalized)) return 1;
  if (/(install|setup|getting-started)/.test(normalized)) return 2;
  if (/contributing/.test(normalized)) return 3;
  if (/changelog/.test(normalized)) return 4;
  if (normalized.startsWith("docs/") || normalized.includes("/docs/")) return 5;
  return 6;
}
