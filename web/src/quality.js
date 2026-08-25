// Explainable local checks complement the GenAI response. Missing information
// stays missing instead of being invented merely to increase the score.
export function analyzeQuality(title, description) {
  const report = `${title}\n${description}`;
  const hasProvidedLogs = /(?:stack trace|exception|console|```|\b[45]\d\d\b|throws?\s+["'`]|error(?:\s+message)?\s*[:"'`]|logs?\s*(?::|\n)\s*(?!not provided|unknown|not specified)\S)/i.test(report);
  const checks = [
    ["Problem description", description.trim().length >= 20],
    ["Actual behaviour", /(?:error|fail|broken|crash|stops?|unable|instead)/i.test(report)],
    ["Operating system", /\b(?:windows|macos|mac os|linux|ubuntu|android|ios)\b/i.test(report)],
    ["Steps to reproduce", /(?:steps? to reproduce|reproduce|^|\n)\s*(?:1[.)]|first[, :])/im.test(report)],
    ["Application version", /\b(?:version\s*)?v?\d+\.\d+(?:\.\d+)?\b/i.test(report)],
    ["Error details or logs", hasProvidedLogs],
  ];
  const found = checks.filter(([, present]) => present).length;
  return { checks, score: Math.round((found / checks.length) * 100) };
}
