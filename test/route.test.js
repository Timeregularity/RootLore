import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../src/app.js";
import { config } from "../src/config.js";

// Integration tests use mocked network responses and never require real secrets.
if (!config.groqApiKey) config.groqApiKey = "test-groq-key";

function request(server, { method = "GET", path = "/", body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const address = server.address();
    const outgoing = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        body: text ? JSON.parse(text) : null,
      }));
    });
    outgoing.on("error", reject);
    if (payload) outgoing.write(payload);
    outgoing.end();
  });
}

function githubIssue(number = 125) {
  return {
    id: number,
    number,
    title: "Refresh token returns 401 on Windows",
    body: "Token renewal fails after expiration and was corrected in version 2.4.2.",
    state: "closed",
    user: { login: "maintainer" },
    labels: [{ name: "bug" }],
    comments: 1,
    html_url: `https://github.com/example/project/issues/${number}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
}

function githubIssueByNumber(number) {
  return {
    ...githubIssue(number),
    title: "Generated files change effort estimates",
    body: "Ignored generated files should not affect repository search results.",
    state: "closed",
  };
}

function generatedContent() {
  return JSON.stringify({
    summary: "The report matches a known refresh-token failure.",
    improvedTitle: "Login returns 401 after token expiration on Windows",
    improvedReport: {
      problem: "Login fails after token expiration.",
      environment: ["Windows", "Version 2.4.1"],
      stepsToReproduce: ["Wait for the token to expire", "Attempt to log in"],
      expectedBehaviour: "The token is renewed.",
      actualBehaviour: "Login returns 401.",
      errorDetails: ["401 Unauthorized"],
    },
    followUpQuestions: [],
    possibleDuplicate: 125,
    suggestedSolution: "Upgrade to version 2.4.2.",
    confidence: "high",
    evidenceIssueNumbers: [125],
    evidenceClaims: [{
      claim: "The failure was corrected in version 2.4.2.",
      issueNumber: 125,
      supportingQuote: "was corrected in version 2.4.2",
      supports: ["summary", "duplicate", "solution"],
    }],
    documentationClaims: [],
  });
}

function installExternalFetchMock({ malformedGroq = false } = {}) {
  const originalFetch = global.fetch;
  const calls = { github: 0, groq: 0 };
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.groq.com")) {
      calls.groq += 1;
      return Response.json(malformedGroq
        ? { choices: [] }
        : { choices: [{ message: { content: generatedContent() } }] });
    }
    calls.github += 1;
    if (url.includes("/comments")) {
      // Demonstrates that an optional evidence failure does not break analysis.
      return Response.json({ message: "temporary failure" }, { status: 503 });
    }
    if (url.includes("/timeline") || url.includes("/releases")) {
      return Response.json([]);
    }
    if (url.endsWith("/issues/28901")) return Response.json(githubIssueByNumber(28901));
    if (url.includes("/issues")) return Response.json([githubIssue()]);
    throw new Error(`Unexpected external URL: ${url}`);
  };
  return { calls, restore: () => { global.fetch = originalFetch; } };
}

test("POST analyze completes the mocked GitHub-to-Groq pipeline", async () => {
  const { restore } = installExternalFetchMock();
  const server = app.listen(0);
  try {
    const response = await request(server, {
      method: "POST",
      path: "/api/repositories/integration-one/project/analyze",
      body: {
        title: "Login returns 401 on Windows",
        description: "Version 2.4.1 fails after the refresh token expires.",
      },
    });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.analysis.evidenceClaims.length, 1);
    assert.deepEqual(response.body.analysis.evidenceIssueNumbers, [125]);
    assert.equal(response.body.analysis.suggestedSolution, "Upgrade to version 2.4.2.");
    assert.equal(response.body.analysis.outcome.type, "verified_solution");
  } finally {
    server.close();
    restore();
  }
});

test("analysis always includes the currently opened closed issue", async () => {
  const { calls, restore } = installExternalFetchMock();
  const server = app.listen(0);
  try {
    const response = await request(server, {
      method: "POST",
      path: "/api/repositories/google-gemini/gemini-cli/analyze",
      body: {
        issueNumber: 28901,
        title: "Generated files change effort estimates",
        description: "Ignored generated files should not affect repository search results.",
      },
    });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.relatedIssues[0].number, 28901);
    assert.equal(response.body.relatedIssues[0].score, 100);
    assert.ok(calls.github > 0);
  } finally {
    server.close();
    restore();
  }
});

test("malformed Groq output becomes a controlled 502 response", async () => {
  const { restore } = installExternalFetchMock({ malformedGroq: true });
  const server = app.listen(0);
  try {
    const response = await request(server, {
      method: "POST",
      path: "/api/repositories/integration-two/project/analyze",
      body: { title: "Login returns 401", description: "Token refresh fails on Windows." },
    });
    assert.equal(response.status, 502);
    assert.match(response.body.error, /invalid structured response/i);
  } finally {
    server.close();
    restore();
  }
});

test("identical analyses reuse GitHub evidence and the Groq result", async () => {
  const { calls, restore } = installExternalFetchMock();
  const server = app.listen(0);
  const requestOptions = {
    method: "POST",
    path: "/api/repositories/cache-check/project/analyze",
    body: {
      title: "Refresh cache test returns 401 on Windows",
      description: "Version 2.4.1 fails after expiration in this cache test.",
    },
  };

  try {
    const first = await request(server, requestOptions);
    const githubCallsAfterFirst = calls.github;
    const second = await request(server, requestOptions);

    assert.equal(first.status, 200);
    assert.equal(first.body.cached, false);
    assert.equal(second.status, 200);
    assert.equal(second.body.cached, true);
    assert.equal(calls.groq, 1);
    assert.equal(calls.github, githubCallsAfterFirst);
  } finally {
    server.close();
    restore();
  }
});

test("non-string report fields return 400 instead of crashing", async () => {
  const server = app.listen(0);
  try {
    const response = await request(server, {
      method: "POST",
      path: "/api/repositories/validation/project/analyze",
      body: { title: 123, description: ["invalid"] },
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test("unknown browser origins are rejected", async () => {
  const server = app.listen(0);
  try {
    const response = await request(server, {
      path: "/health",
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});
