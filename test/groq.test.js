import test from "node:test";
import assert from "node:assert/strict";
import {
  formatImprovedReport,
  parseFailedGeneration,
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
    documentationClaims: [],
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
  assert.equal(result.possibleRemediation, "Invented fix");
  assert.equal(result.outcome.type, "possible_remediation");
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

test("missing structured report fields become actionable placeholders", () => {
  const description = formatImprovedReport({
    problem: "Login fails.",
    environment: [],
    stepsToReproduce: [],
    expectedBehaviour: "",
    actualBehaviour: "Login fails.",
    errorDetails: [],
  });

  assert.match(description, /\[Add OS, application version, runtime/);
  assert.match(description, /1\. \[Add the first reproduction step\]/);
  assert.match(description, /\[Describe what should happen\]/);
  assert.match(description, /\[Paste the exact error message, stack trace/);
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

test("an exact repository documentation quote can support a solution", () => {
  const result = validateAnalysis(
    generatedAnalysis({
      suggestedSolution: "Upgrade to Node.js 18 or newer.",
      confidence: "high",
      documentationClaims: [{
        claim: "Node.js 18 is required.",
        path: "README.md",
        supportingQuote: "Node.js 18 or newer is required",
        supports: ["solution"],
      }],
    }),
    [],
    [{
      path: "README.md",
      passage: "Installation: Node.js 18 or newer is required for this project.",
      url: "https://github.com/example/repo/blob/main/README.md",
    }],
  );

  assert.equal(result.suggestedSolution, "Upgrade to Node.js 18 or newer.");
  assert.equal(result.possibleRemediation, null);
  assert.equal(result.outcome.type, "verified_solution");
  assert.equal(result.documentationClaims.length, 1);
  assert.match(result.documentationClaims[0].url, /README\.md$/);
});

test("a documented command correction becomes a verified solution without model citation", () => {
  const result = validateAnalysis(
    generatedAnalysis(),
    [],
    [{
      path: "README.md",
      passage: "npm install -g @google/gemini-cli",
      documentedCommand: "npm install -g @google/gemini-cli",
      submittedCommand: "nam install -g @google/gemini-cli",
      commandCorrection: true,
      url: "https://github.com/google-gemini/gemini-cli/blob/main/README.md",
    }],
  );

  assert.equal(result.outcome.type, "verified_solution");
  assert.match(result.suggestedSolution, /npm install -g @google\/gemini-cli/);
  assert.equal(result.repositoryClaims[0].deterministic, true);
});

test("a completed issue with a closer-confirmed fix becomes verified evidence", () => {
  const result = validateAnalysis(generatedAnalysis(), [{
    number: 28709,
    title: "400 error",
    body: "Requests return 400.",
    state: "closed",
    stateReason: "completed",
    discussion: [{ author: "reporter", body: "/clear did the trick", url: "https://example.test/comment" }],
    timeline: [{ event: "closed", actor: "reporter" }],
  }]);

  assert.equal(result.outcome.type, "verified_solution");
  assert.equal(result.suggestedSolution, "/clear did the trick");
  assert.equal(result.evidenceClaims[0].deterministic, true);
});

test("a search result without stateReason can use its closer-confirmed resolution", () => {
  const result = validateAnalysis(generatedAnalysis(), [{
    number: 1560,
    title: "GEMINI_API_KEY not detected",
    body: "The exported key is not detected on macOS.",
    state: "closed",
    stateReason: null,
    discussion: [{
      author: "sethtroisi",
      body: "I just tested with export GEMINI_API_KEY=<KEY> and it worked so I'm closing this issue as resolved.",
    }],
    timeline: [{ event: "closed", actor: "sethtroisi" }],
  }]);

  assert.equal(result.outcome.type, "verified_solution");
  assert.match(result.suggestedSolution, /export GEMINI_API_KEY/);
  assert.equal(result.evidenceClaims[0].issueNumber, 1560);
});

test("a resolution-like comment from someone other than the closer is not promoted", () => {
  const result = validateAnalysis(generatedAnalysis(), [{
    number: 1561,
    title: "Authentication failure",
    body: "Authentication fails.",
    state: "closed",
    stateReason: null,
    discussion: [{ author: "random-user", body: "Reinstalling worked for me." }],
    timeline: [{ event: "closed", actor: "maintainer" }],
  }]);

  assert.equal(result.outcome.type, "structured_issue");
  assert.equal(result.suggestedSolution, null);
});

test("a closed issue without a confirmed outcome is not automatically solved", () => {
  const result = validateAnalysis(generatedAnalysis(), [{
    number: 88,
    title: "Old report",
    body: "No longer maintained.",
    state: "closed",
    stateReason: "not_planned",
    discussion: [{ author: "maintainer", body: "Closing as stale." }],
    timeline: [{ event: "closed", actor: "maintainer" }],
  }]);

  assert.equal(result.outcome.type, "structured_issue");
  assert.equal(result.suggestedSolution, null);
});

test("a closed current issue without a resolution explains why it is unresolved", () => {
  const result = validateAnalysis(
    generatedAnalysis(),
    [{
      number: 28901,
      title: "Generated files change automated extension analysis",
      body: "Ignored generated files should not affect repository search results.",
      state: "closed",
      stateReason: "completed",
      discussion: [{ author: "gemini-cli[bot]", body: "Automated triage metadata." }],
      timeline: [{ event: "closed", actor: "JelleBwns" }],
    }],
    [],
    28901,
  );

  assert.equal(result.outcome.type, "structured_issue");
  assert.match(result.outcome.message, /closed, but no confirmed resolution/i);
});

test("an unsupported result gives actionable evidence-gathering guidance", () => {
  const result = validateAnalysis(generatedAnalysis({
    followUpQuestions: [
      "What exact console error appears?",
      "Which React DevTools version is installed?",
    ],
  }), []);

  assert.equal(result.outcome.type, "structured_issue");
  assert.match(result.outcome.message, /exact console error/i);
  assert.match(result.outcome.message, /React DevTools version/i);
  assert.match(result.outcome.message, /analyze again/i);
});

test("high-confidence grounded reasoning becomes an inferred solution", () => {
  const result = validateAnalysis(generatedAnalysis({
    suggestedSolution: "Clear the corrupted context before retrying.",
    confidence: "high",
    evidenceClaims: [{
      claim: "Context state causes the request mismatch.",
      issueNumber: 42,
      supportingQuote: "context state causes the request mismatch",
      supports: ["summary"],
    }],
  }), [{
    number: 42,
    title: "Request mismatch",
    body: "The context state causes the request mismatch during retries.",
    discussion: [],
  }]);

  assert.equal(result.outcome.type, "inferred_solution");
  assert.equal(result.inferredSolution, "Clear the corrupted context before retrying.");
  assert.equal(result.suggestedSolution, null);
});

test("medium-confidence repository pattern becomes a bounded inferred solution", () => {
  const result = validateAnalysis(generatedAnalysis({
    suggestedSolution: "Add the entry using the neighboring JSON structure, preserve valid JSON syntax, and validate the file afterward. Confirm the exact placement by inspecting adjacent entries.",
    confidence: "medium",
    documentationClaims: [{
      claim: "Grammar content uses JSON formatting.",
      path: "CONTRIBUTING.md",
      supportingQuote: "Grammar entries are stored as JSON and embedded double quotes must be escaped.",
      supports: ["summary"],
    }],
  }), [], [{
    path: "CONTRIBUTING.md",
    passage: "Grammar entries are stored as JSON and embedded double quotes must be escaped.",
    url: "https://github.com/example/repo/blob/main/CONTRIBUTING.md",
  }]);

  assert.equal(result.outcome.type, "inferred_solution");
  assert.equal(result.confidence, "medium");
  assert.match(result.inferredSolution, /neighboring JSON structure/);
});

test("an unseen generated version and low-confidence known-cause claim are rejected", () => {
  const result = validateAnalysis(generatedAnalysis({
    summary: "The crash is caused by a known DevTools bug.",
    suggestedSolution: "Upgrade to React 19.2.8 or later.",
    confidence: "low",
    evidenceClaims: [{
      claim: "A similar node error exists.",
      issueNumber: 37377,
      supportingQuote: "Cannot remove node because no matching node was found",
      supports: ["summary"],
    }],
  }), [{
    number: 37377,
    title: "DevTools node removal error",
    body: "Cannot remove node because no matching node was found",
    discussion: [],
  }]);

  assert.equal(result.possibleRemediation, null);
  assert.equal(result.outcome.type, "structured_issue");
  assert.match(result.summary, /resembles/i);
  assert.match(result.summary, /not confirmed/i);
});

test("a destructive low-confidence guess is rejected without solution evidence", () => {
  const result = validateAnalysis(generatedAnalysis({
    suggestedSolution: "Disable the DevTools extension or switch to a different version.",
    confidence: "low",
    evidenceClaims: [{
      claim: "A similar report exists.",
      issueNumber: 10,
      supportingQuote: "Developer Tools crashes when opening the panel",
      supports: ["summary"],
    }],
  }), [{
    number: 10,
    title: "Developer Tools crash",
    body: "Developer Tools crashes when opening the panel",
    discussion: [],
  }]);

  assert.equal(result.possibleRemediation, null);
  assert.equal(result.outcome.type, "structured_issue");
});

test("retrieved issue errors are not copied into the reporter's improved report", () => {
  const result = validateAnalysis(generatedAnalysis({
    improvedReport: {
      problem: "Application crashes.",
      environment: ["Windows", "React 19.0"],
      stepsToReproduce: ["Open Developer Tools"],
      expectedBehaviour: "The application remains stable.",
      actualBehaviour: "The application crashes.",
      errorDetails: ["Cannot remove node 2450 because no matching node was found in the Store."],
    },
  }), [{
    number: 37377,
    title: "DevTools node removal error",
    body: "Cannot remove node 2450 because no matching node was found in the Store.",
    discussion: [],
  }], [], null, "Application crashes on Windows", "React 19.0 crashes when I open Developer Tools. The console shows an error.");

  assert.deepEqual(result.improvedReport.errorDetails, []);
  assert.match(result.improvedDescription, /Paste the exact error message/);
});

test("unreported environment versions and reproduction actions are removed", () => {
  const result = validateAnalysis(generatedAnalysis({
    improvedReport: {
      problem: "Application crashes.",
      environment: ["Windows", "React 19.0", "react-devtools-extensions 7.0.1-3cde211b0c"],
      stepsToReproduce: ["Open the application on Windows", "Open Developer Tools"],
      expectedBehaviour: "The application remains stable.",
      actualBehaviour: "The application crashes.",
      errorDetails: [],
    },
  }), [], [], null, "Application crashes on Windows", "Version 19.0 crashes when I open Developer Tools.");

  assert.deepEqual(result.improvedReport.environment, ["Windows", "React 19.0"]);
  assert.deepEqual(result.improvedReport.stepsToReproduce, ["Open Developer Tools"]);
  assert.doesNotMatch(result.improvedDescription, /7\.0\.1/);
  assert.doesNotMatch(result.improvedDescription, /Open the application/);
});

test("malformed provider JSON is rejected with a controlled error", () => {
  assert.throws(
    () => parseProviderAnalysis({ choices: [{ message: { content: "not-json" } }] }),
    /invalid structured response/i,
  );
});

test("a valid failed generation with omitted evidence arrays is recovered", () => {
  const recovered = parseFailedGeneration({
    error: {
      failed_generation: JSON.stringify({
        summary: "No matching issue was found.",
        improvedTitle: "Login fails with invalid grant",
        improvedReport: {
          problem: "Login fails.",
          environment: [],
          stepsToReproduce: ["Attempt Google login"],
          expectedBehaviour: "Login succeeds.",
          actualBehaviour: "Login fails.",
          errorDetails: ["invalid_grant"],
        },
        possibleDuplicate: null,
        suggestedSolution: null,
        confidence: "low",
      }),
    },
  });

  assert.ok(recovered);
  assert.equal(recovered.possibleDuplicate, null);
  assert.equal(recovered.suggestedSolution, null);
  assert.equal(recovered.confidence, "low");
  assert.deepEqual(recovered.documentationClaims, []);
  assert.deepEqual(recovered.evidenceClaims, []);
});
