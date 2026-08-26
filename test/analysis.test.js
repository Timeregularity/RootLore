import test from "node:test";
import assert from "node:assert/strict";
import {
  extractReferencedPaths,
  findDocumentedCommandCorrections,
  findRelatedDocuments,
  findRelatedIssues,
  findRelatedSourcePassages,
} from "../src/services/analysis.js";

const baseIssue = {
  body: "",
  labels: [],
  comments: 0,
  state: "open",
  url: "https://github.com/example/repo/issues/1",
};

test("strong title and error-code matches rank above weak matches", () => {
  const issues = [
    { ...baseIssue, number: 1, title: "Login returns 401 on Windows", body: "Token refresh fails" },
    { ...baseIssue, number: 2, title: "Button color is wrong", body: "Windows theme issue" },
  ];

  const results = findRelatedIssues(
    issues,
    "Login fails with 401",
    "Token refresh fails on Windows",
  );

  assert.equal(results[0].number, 1);
  assert.equal(results.length, 1);
  assert.ok(results[0].matchedTerms.includes("401"));
});

test("common words do not create unrelated matches", () => {
  const issues = [
    { ...baseIssue, number: 1, title: "The button is blue" },
  ];

  const results = findRelatedIssues(issues, "The application", "This is not working");
  assert.equal(results.length, 0);
});

test("repository documentation is chunked and ranked locally", () => {
  const results = findRelatedDocuments([{
    path: "docs/troubleshooting.md",
    url: "https://github.com/example/repo/blob/main/docs/troubleshooting.md",
    sha: "abc",
    content: "## Authentication\n\nRefresh token failures return 401 on Windows. Upgrade to version 2.4.2.\n\n## Styling\n\nButton colors can be changed with CSS.",
  }], "Login returns 401", "Refresh token fails on Windows");

  assert.equal(results.length, 1);
  assert.match(results[0].passage, /Upgrade to version 2\.4\.2/);
});

test("a nearby documented quota outranks generic rate-limit advice", () => {
  const results = findRelatedDocuments([{
    path: "README.md",
    url: "https://github.com/example/repo/blob/main/README.md",
    sha: "readme-sha",
    content: "Free tier: 60 requests/min and 1,000 requests/day with personal Google account.\n\nCheck the dashboard when a request fails.",
  }, {
    path: "docs/faq.md",
    url: "https://github.com/example/repo/blob/main/docs/faq.md",
    sha: "faq-sha",
    content: "A request limit error means the API rate limit was exceeded.",
  }], "Request limit exceeded", "The daily limit appeared after nearly 998 requests.");

  assert.equal(results[0].path, "README.md");
  assert.match(results[0].passage, /1,000 requests\/day/);
  assert.ok(results[0].matchedTerms.includes("nearby numeric value"));
});

test("only explicit repository source paths are extracted", () => {
  const paths = extractReferencedPaths(
    "Failure in packages/core/src/chat.ts:81 and src/auth/token.js#L20. See https://example.com/file.txt",
  );
  assert.deepEqual(paths, ["packages/core/src/chat.ts", "src/auth/token.js"]);
});

test("explicit JSON and YAML data paths can be retrieved for bounded inference", () => {
  const paths = extractReferencedPaths(
    "Add the entry to data/grammar/ja.json and follow config/languages.yaml.",
  );
  assert.deepEqual(paths, ["data/grammar/ja.json", "config/languages.yaml"]);
});

test("referenced source files are ranked into bounded passages", () => {
  const passages = findRelatedSourcePassages([{
    path: "src/auth/token.js",
    url: "https://github.com/example/repo/blob/main/src/auth/token.js",
    sha: "source-sha",
    content: "function refreshToken() {\n  throw new Error('invalid_grant');\n}\n",
  }], "Login invalid_grant", "refreshToken fails", 1);

  assert.equal(passages.length, 1);
  assert.equal(passages[0].sourceType, "source");
  assert.match(passages[0].passage, /invalid_grant/);
});

test("a one-character command typo is matched to repository documentation", () => {
  const corrections = findDocumentedCommandCorrections([{
    path: "README.md",
    url: "https://github.com/google-gemini/gemini-cli/blob/main/README.md",
    sha: "readme-sha",
    content: "## Install\n\n`npm install -g @google/gemini-cli`\n",
  }], "Unable to install\nnam install -g @google/gemini-cli");

  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].submittedCommand, "nam install -g @google/gemini-cli");
  assert.equal(corrections[0].documentedCommand, "npm install -g @google/gemini-cli");
});
