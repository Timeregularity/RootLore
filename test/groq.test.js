import test from "node:test";
import assert from "node:assert/strict";
import {
  formatImprovedReport,
  parseProviderAnalysis,
  validateAnalysis,
} from "../src/services/groq.js";

function generatedAnalysis(overrides = {}) {
  return {
    summary: "Summary",
    improvedTitle: "Improved title",
    improvedDescription: "Improved description",
    followUpQuestions: [],
    possibleDuplicate: null,
    suggestedSolution: null,
    confidence: "low",
    evidenceIssueNumbers: [],
    evidenceClaims: [],
    ...overrides,
  };
}

test("invalid citations and duplicate numbers are removed", () => {
  const result = validateAnalysis(
    generatedAnalysis({
      possibleDuplicate: 999,
      evidenceIssueNumbers: [125, 999],
      evidenceClaims: [
        { claim: "Valid claim", issueNumber: 125, supportingQuote: "Token renewal fails after expiration", supports: ["summary"] },
        { claim: "Invented claim", issueNumber: 999, supportingQuote: "This quote is entirely invented", supports: ["solution"] },
      ],
    }),
    [{ number: 125, title: "Refresh failure", body: "Token renewal fails after expiration", discussion: [] }],
  );

  assert.deepEqual(result.evidenceIssueNumbers, [125]);
  assert.equal(result.possibleDuplicate, null);
  assert.equal(result.evidenceClaims.length, 1);
});

test("a solution without verified citations is removed", () => {
  const result = validateAnalysis(
    generatedAnalysis({ suggestedSolution: "Invented fix", confidence: "high" }),
    [{ number: 125 }],
  );

  assert.equal(result.suggestedSolution, null);
  assert.equal(result.confidence, "low");
});

test("structured report fields produce stable numbered Markdown", () => {
  const description = formatImprovedReport({
    problem: "Developer Tools crashes.",
    environment: ["Operating system: Windows", "Version: 19.0"],
    stepsToReproduce: ["Open Developer Tools", "Open the Components panel"],
    expectedBehaviour: "The panel opens.",
    actualBehaviour: "The application crashes.",
    errorDetails: ["Cannot remove node because no matching node was found."],
  });

  assert.match(description, /Operating system: Windows/);
  assert.match(description, /1\. Open Developer Tools/);
  assert.match(description, /## Actual behaviour\nThe application crashes/);
});

test("a fabricated quote from a real issue is rejected", () => {
  const result = validateAnalysis(
    generatedAnalysis({
      suggestedSolution: "Install fictional version 99.",
      confidence: "high",
      evidenceClaims: [{
        claim: "Version 99 fixes the issue.",
        issueNumber: 125,
        supportingQuote: "Version 99 definitely fixes everything",
        supports: ["solution"],
      }],
    }),
    [{ number: 125, title: "Refresh failure", body: "Fixed token renewal in version 2.4.2", discussion: [] }],
  );

  assert.equal(result.evidenceClaims.length, 0);
  assert.equal(result.suggestedSolution, null);
  assert.equal(result.confidence, "low");
});

test("malformed provider JSON is rejected with a controlled error", () => {
  assert.throws(
    () => parseProviderAnalysis({ choices: [{ message: { content: "not-json" } }] }),
    /invalid structured response/i,
  );
});
