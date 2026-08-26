import test from "node:test";
import assert from "node:assert/strict";
import { buildIssueSearchTerms } from "../src/services/github.js";

test("issue search prefers a rare environment-variable signature", () => {
  const terms = buildIssueSearchTerms(
    "Gemini CLI cannot detect GEMINI_API_KEY after exporting it",
    "The key exists in .zshrc on macOS but authentication fails.",
  );
  assert.deepEqual(terms, ["gemini_api_key"]);
});

test("generic issue search uses only two meaningful title terms", () => {
  const terms = buildIssueSearchTerms(
    "Application crashes while opening developer tools",
    "The application closes unexpectedly.",
  );
  assert.equal(terms.length, 2);
  assert.ok(terms.includes("developer"));
});
