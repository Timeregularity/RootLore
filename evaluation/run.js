import { findRelatedIssues } from "../src/services/analysis.js";
import { retrievalCases } from "./cases.js";

let correct = 0;

console.log("RootLore retrieval evaluation\n");
for (const evaluation of retrievalCases) {
  const [topResult] = findRelatedIssues(
    evaluation.issues,
    evaluation.title,
    evaluation.description,
    1,
  );
  const passed = topResult?.number === evaluation.expectedIssue;
  if (passed) correct += 1;

  console.log(
    `${passed ? "PASS" : "FAIL"} | ${evaluation.name} | expected #${evaluation.expectedIssue} | received #${topResult?.number ?? "none"} | score ${topResult?.score ?? 0}%`,
  );
}

const accuracy = Math.round((correct / retrievalCases.length) * 100);
console.log(`\nTop-1 accuracy: ${correct}/${retrievalCases.length} (${accuracy}%)`);

if (correct !== retrievalCases.length) process.exitCode = 1;
