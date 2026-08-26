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

test("a formatted error-message placeholder keeps issue quality below 100", () => {
  const result = analyzeQuality(
    "Application crashes on Windows when opening Developer Tools",
    "## Problem\nApplication crashes.\n\n## Environment\n- Windows\n- React 19.0\n\n## Steps to reproduce\n1. Open the app\n\n## Expected behaviour\nApp remains stable.\n\n## Actual behaviour\nApp crashes.\n\n## Error details or logs\n- Error message not provided.",
  );
  const logsCheck = result.checks.find(([label]) => label === "Error details or logs");

  assert.equal(logsCheck[1], false);
  assert.equal(result.score, 83);
});

test("an instructional bracket placeholder is not treated as an error log", () => {
  const result = analyzeQuality(
    "Application crashes on Windows",
    "Version 19.0 crashes.\n\n## Error details or logs\n- [Paste the exact error message, stack trace, or relevant logs]",
  );
  const logsCheck = result.checks.find(([label]) => label === "Error details or logs");

  assert.equal(logsCheck[1], false);
});

test("saying only that the console shows an error is not treated as an exact log", () => {
  const result = analyzeQuality(
    "Application crashes on Windows",
    "Version 19.0 crashes when Developer Tools opens. The console shows an error.",
  );
  const logsCheck = result.checks.find(([label]) => label === "Error details or logs");

  assert.equal(logsCheck[1], false);
});
