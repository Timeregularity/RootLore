import test from "node:test";
import assert from "node:assert/strict";
import { findRelatedIssues } from "../src/services/analysis.js";

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
