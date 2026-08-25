import test from "node:test";
import assert from "node:assert/strict";
import { formatImprovedReport, validateAnalysis } from "../src/services/groq.js";

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
    ...overrides,
  };
}

test("invalid citations and duplicate numbers are removed", () => {
  const result = validateAnalysis(
    generatedAnalysis({
      possibleDuplicate: 999,
      evidenceIssueNumbers: [125, 999],
    }),
    [{ number: 125 }],
  );

  assert.deepEqual(result.evidenceIssueNumbers, [125]);
  assert.equal(result.possibleDuplicate, null);
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
