import test from "node:test";
import assert from "node:assert/strict";
import { analyzeQuality } from "../web/src/quality.js";

test("a quoted thrown error counts as error evidence", () => {
  const result = analyzeQuality(
    "React crashes on Windows in DevTools",
    "Version 19.0 throws \"Cannot remove node because no matching node was found\".",
  );
  const errorCheck = result.checks.find(([label]) => label === "Error details or logs");

  assert.equal(errorCheck[1], true);
  assert.equal(result.score, 83);
});

test("explanation text does not pretend to contain reproduction steps", () => {
  const result = analyzeQuality(
    "React crashes on Windows in DevTools",
    "Version 19.0 throws \"Cannot remove node\" when DevTools opens.",
  );
  const stepsCheck = result.checks.find(([label]) => label === "Steps to reproduce");

  assert.equal(stepsCheck[1], false);
});

test("a missing logs placeholder does not count as provided evidence", () => {
  const result = analyzeQuality(
    "Application fails on Windows",
    "Version 2.0 fails.\n\n## Error details or logs\nNot provided",
  );
  const logsCheck = result.checks.find(([label]) => label === "Error details or logs");

  assert.equal(logsCheck[1], false);
});
