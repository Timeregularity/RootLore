// Common words add noise to similarity scores, so they are ignored.
const STOP_WORDS = new Set([
  "after", "and", "are", "but", "can", "does", "for", "from", "have",
  "into", "not", "that", "the", "then", "this", "using", "was", "were",
  "when", "where", "which", "with", "you", "your",
]);

function words(value) {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

function sharedWords(reportWords, candidateWords) {
  return [...reportWords].filter((word) => candidateWords.has(word));
}

function errorCodes(value) {
  return new Set(value.toLowerCase().match(/\b(?:[45]\d\d|[a-z]+error|e_[a-z0-9_]+)\b/g) ?? []);
}

// Rank issues with understandable weights: titles matter most, then labels,
// followed by body text. Exact error codes receive an additional bonus.
export function findRelatedIssues(issues, title, description, limit = 5) {
  const reportWords = words(`${title} ${description}`);
  const reportErrors = errorCodes(`${title} ${description}`);

  return issues
    .map((issue) => {
      const titleMatches = sharedWords(reportWords, words(issue.title));
      const labelMatches = sharedWords(reportWords, words(issue.labels.join(" ")));
      const bodyMatches = sharedWords(reportWords, words(issue.body || ""));
      const exactErrors = sharedWords(
        reportErrors,
        errorCodes(`${issue.title} ${issue.body || ""}`),
      );
      const matchedTerms = [...new Set([
        ...titleMatches,
        ...labelMatches,
        ...bodyMatches,
        ...exactErrors,
      ])];
      const earnedPoints =
        (titleMatches.length * 3) +
        (labelMatches.length * 2) +
        bodyMatches.length +
        (exactErrors.length * 4);
      const maximumUsefulPoints = Math.max(reportWords.size * 3, 1);
      const score = Math.min(100, Math.round((earnedPoints / maximumUsefulPoints) * 100));

      return { ...issue, score, matchedTerms };
    })
    .filter((issue) => issue.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}
