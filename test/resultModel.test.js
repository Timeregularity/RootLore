import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getResultModel } from "../web/src/resultModel.js";

function data(overrides = {}) {
  return { analysis: {
    outcome: null, suggestedSolution: null, inferredSolution: null,
    possibleRemediation: null, solutionPlan: null, evidenceClaims: [],
    documentationClaims: [], ...overrides,
  } };
}

for (const [type, field] of [
  ["verified_solution", "suggestedSolution"],
  ["inferred_solution", "inferredSolution"],
  ["possible_remediation", "possibleRemediation"],
]) {
  test(`${type} selects the correct actionable result`, () => {
    const result = getResultModel(data({ outcome: { type }, [field]: "Apply a bounded change." }));
    assert.equal(result.outcomeType, type);
    assert.equal(result.steps.length, 1);
  });
}

test("structured issue does not render an empty solution plan", () => {
  const result = getResultModel(data({ outcome: { type: "structured_issue" } }));
  assert.equal(result.selectedSolution, null);
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.verification, []);
});

test("missing solutionPlan uses a conservative text fallback", () => {
  const result = getResultModel(data({ suggestedSolution: "Use the cited configuration." }));
  assert.equal(result.outcomeType, "verified_solution");
  assert.equal(result.steps[0].instruction, "Use the cited configuration.");
  assert.equal(result.steps[0].code, null);
});

test("solution and context evidence remain separate counts", () => {
  const result = getResultModel(data({ evidenceClaims: [
    { supports: ["solution"] }, { supports: ["summary"] },
  ] }));
  assert.equal(result.solutionCitations, 1);
  assert.equal(result.contextCitations, 1);
});

test("technical text uses a React code element without unsafe HTML rendering", async () => {
  const source = await readFile(new URL("../web/src/ResultView.jsx", import.meta.url), "utf8");
  assert.match(source, /<pre><code>\{code\}<\/code><\/pre>/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
