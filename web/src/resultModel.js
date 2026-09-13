export function getResultModel(data) {
  const ai = data.analysis;
  const outcomeType = ai.outcome?.type || (ai.suggestedSolution
    ? "verified_solution"
    : ai.inferredSolution ? "inferred_solution"
      : ai.possibleRemediation ? "possible_remediation" : "structured_issue");
  const allClaims = [...(ai.evidenceClaims || []), ...(ai.documentationClaims || [])];
  const solutionCitations = allClaims.filter((claim) => claim.supports?.includes("solution")).length;
  const selectedSolution = ai.suggestedSolution || ai.inferredSolution || ai.possibleRemediation;
  const plan = ai.solutionPlan && selectedSolution ? ai.solutionPlan : null;
  return {
    ai, outcomeType, selectedSolution, plan, solutionCitations,
    contextCitations: allClaims.length - solutionCitations,
    steps: plan?.steps?.length ? plan.steps : selectedSolution
      ? [{ title: "Review this recommendation", instruction: selectedSolution, code: null }] : [],
    verification: plan?.verificationSteps?.length ? plan.verificationSteps : selectedSolution
      ? ["Re-run the original failing operation and confirm whether the reported symptom changes."] : [],
  };
}
