import { config } from "../config.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
const REQUEST_TIMEOUT_MS = 30_000;

// Groq constrains the model to this shape, making frontend parsing predictable.
const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    improvedTitle: { type: "string" },
    improvedReport: {
      type: "object",
      properties: {
        problem: { type: "string" },
        environment: { type: "array", items: { type: "string" } },
        stepsToReproduce: { type: "array", items: { type: "string" } },
        expectedBehaviour: { type: "string" },
        actualBehaviour: { type: "string" },
        errorDetails: { type: "array", items: { type: "string" } },
      },
      required: [
        "problem", "environment", "stepsToReproduce", "expectedBehaviour",
        "actualBehaviour", "errorDetails",
      ],
      additionalProperties: false,
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
    possibleDuplicate: { type: ["integer", "null"] },
    suggestedSolution: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidenceIssueNumbers: { type: "array", items: { type: "integer" } },
  },
  required: [
    "summary", "improvedTitle", "improvedReport", "followUpQuestions",
    "possibleDuplicate", "suggestedSolution", "confidence",
    "evidenceIssueNumbers",
  ],
  additionalProperties: false,
};

function listOrMissing(items, prefix = "- ") {
  return items.length
    ? items.map((item, index) => `${prefix === "number" ? `${index + 1}. ` : prefix}${item}`).join("\n")
    : "Not provided";
}

// Format model-provided fields ourselves so malformed Markdown cannot reach the UI.
export function formatImprovedReport(report) {
  return `## Problem
${report.problem || "Not provided"}

## Environment
${listOrMissing(report.environment)}

## Steps to reproduce
${listOrMissing(report.stepsToReproduce, "number")}

## Expected behaviour
${report.expectedBehaviour || "Not provided"}

## Actual behaviour
${report.actualBehaviour || "Not provided"}

## Error details or logs
${listOrMissing(report.errorDetails)}`;
}

// Never trust generated citations without checking them against retrieved data.
export function validateAnalysis(analysis, relatedIssues) {
  const allowedNumbers = new Set(relatedIssues.map((issue) => issue.number));
  const evidenceIssueNumbers = analysis.evidenceIssueNumbers.filter((number) =>
    allowedNumbers.has(number)
  );
  const possibleDuplicate = allowedNumbers.has(analysis.possibleDuplicate)
    ? analysis.possibleDuplicate
    : null;
  const hasVerifiedEvidence = evidenceIssueNumbers.length > 0;

  return {
    ...analysis,
    improvedDescription: analysis.improvedReport
      ? formatImprovedReport(analysis.improvedReport)
      : analysis.improvedDescription,
    evidenceIssueNumbers,
    possibleDuplicate,
    suggestedSolution: hasVerifiedEvidence ? analysis.suggestedSolution : null,
    confidence: hasVerifiedEvidence ? analysis.confidence : "low",
  };
}

// Ask the model to analyze a report using only the supplied GitHub evidence.
export async function generateIssueAnalysis(
  title,
  description,
  relatedIssues,
  releases = [],
) {
  if (!config.groqApiKey) {
    const error = new Error("GROQ_API_KEY is not configured");
    error.status = 503;
    throw error;
  }

  // Limit issue bodies so one request does not send unnecessary repository data.
  const evidence = relatedIssues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body?.slice(0, 1500) || "No description",
    state: issue.state,
    labels: issue.labels,
    url: issue.url,
    comments: issue.discussion.slice(0, 10).map((comment) => ({
      author: comment.author,
      body: comment.body?.slice(0, 800) || "",
      url: comment.url,
    })),
    timeline: issue.timeline?.slice(0, 10) || [],
  }));

  const releaseEvidence = releases.map((release) => ({
    name: release.name,
    tag: release.tag,
    body: release.body?.slice(0, 1000) || "",
    url: release.url,
  }));

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rootlore_issue_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
      messages: [
        {
          role: "system",
          content: `You are RootLore, a GitHub issue analyst. Use only the supplied
GitHub evidence. Never invent fixes, versions, issue numbers, or links. If the
evidence is insufficient, say so. Build improvedReport by extracting facts from
both the submitted title and description. Preserve every known version, operating
system, user action, expected or actual behaviour, and exact error message. A
stated action such as "open Developer Tools" is a valid reproduction step. A
stated symptom such as "application crashes" is actual behaviour. Do not discard
known facts merely because the original report lacks headings. Use empty arrays
or "Not provided" only when information is genuinely absent, and never invent
facts. Return valid JSON with exactly these fields: summary (string),
improvedTitle (string), improvedReport (object containing problem, environment,
stepsToReproduce, expectedBehaviour, actualBehaviour, and errorDetails),
followUpQuestions (array of strings), possibleDuplicate (issue number or null),
suggestedSolution (string or null), confidence (low, medium, or high), and
evidenceIssueNumbers (array of issue numbers).`,
        },
        {
          role: "user",
          content: JSON.stringify({
            report: { title, description },
            evidence,
            releases: releaseEvidence,
          }),
        },
      ],
      }),
    });
  } catch (cause) {
    const error = new Error(
      cause.name === "TimeoutError"
        ? "GenAI analysis timed out"
        : "Unable to reach the Groq API",
    );
    error.status = 503;
    throw error;
  }

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || "Groq request failed");
    error.status = response.status;
    throw error;
  }

  const parsedAnalysis = JSON.parse(data.choices[0].message.content);

  return {
    model: MODEL,
    analysis: validateAnalysis(parsedAnalysis, relatedIssues),
  };
}
