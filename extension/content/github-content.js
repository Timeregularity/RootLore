function textFrom(selectors, clean = (value) => value) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    // innerText preserves the visible line breaks in headings and code blocks,
    // while textContent often joins GitHub controls and body text together.
    const value = "value" in (element || {}) ? element.value : element?.innerText;
    if (value?.trim()) return clean(value.trim());
  }
  return "";
}

function cleanExistingIssueBody(value) {
  // Modern GitHub sometimes exposes a large issue container instead of only the
  // rendered Markdown. Remove its UI header by starting at the first template
  // heading, while leaving the reporter's actual wording unchanged.
  const contentHeadings = [
    "What happened?",
    "Summary",
    "Problem",
    "Steps to reproduce",
  ];
  const positions = contentHeadings
    .map((heading) => value.indexOf(heading))
    .filter((position) => position >= 0);
  // "Description" is also a GitHub UI label, so only use it when no real
  // issue-template heading can be found.
  const descriptionPosition = value.indexOf("Description");
  const start = positions.length
    ? Math.min(...positions)
    : Math.max(descriptionPosition, 0);
  return value
    .slice(start)
    .replace(/^Description\s*/i, "")
    .replace(/\n?Issue body actions\s*/i, "\n")
    .trim();
}

function readGitHubIssue() {
  const parts = location.pathname.split("/").filter(Boolean);
  const issueIndex = parts.indexOf("issues");
  if (issueIndex !== 2 || !parts[0] || !parts[1]) return null;

  const isDraft = parts[3] === "new" || !/^\d+$/.test(parts[3] || "");
  return {
    owner: parts[0],
    repository: parts[1],
    issueNumber: isDraft ? null : Number(parts[3]),
    mode: isDraft ? "create" : "investigate",
    url: location.href,
    title: textFrom(isDraft
      ? ["input[name='issue[title]']", "input[placeholder*='Title' i]"]
      : ["[data-testid='issue-title']", "bdi.js-issue-title", "h1 bdi"]),
    description: textFrom(isDraft
      ? ["textarea[name='issue[body]']", "textarea[placeholder*='description' i]"]
      : [
          "[data-testid='issue-body'] .markdown-body",
          ".js-comment-container .comment-body .markdown-body",
          ".js-comment-container .comment-body",
          "[data-testid='issue-body']",
        ], isDraft ? (value) => value : cleanExistingIssueBody),
  };
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function insertImprovedIssue(title, description) {
  const titleInput = document.querySelector("input[name='issue[title]'], input[placeholder*='Title' i]");
  const bodyInput = document.querySelector("textarea[name='issue[body]'], textarea[placeholder*='description' i]");
  if (!titleInput || !bodyInput) return false;
  setNativeValue(titleInput, title);
  setNativeValue(bodyInput, description);
  titleInput.focus();
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "GET_GITHUB_ISSUE") respond(readGitHubIssue());
  if (message.type === "INSERT_IMPROVED_ISSUE") {
    respond({ inserted: insertImprovedIssue(message.title, message.description) });
  }
});
