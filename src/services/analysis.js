// Common words add noise to similarity scores, so they are ignored.
const STOP_WORDS = new Set([
  "after", "and", "are", "but", "can", "does", "for", "from", "have",
  "into", "not", "that", "the", "then", "this", "using", "was", "were",
  "when", "where", "which", "with", "you", "your",
]);
const MIN_RELEVANCE_SCORE = 15;

function words(value) {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !STOP_WORDS.has(word))
      .map((word) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word) ?? [],
  );
}

function numbers(value) {
  return (value.replace(/(?<=\d),(?=\d)/g, "").match(/\b\d+(?:\.\d+)?\b/g) || [])
    .map(Number)
    .filter(Number.isFinite);
}

function hasNearbyNumber(report, candidate) {
  const reportNumbers = numbers(report);
  const candidateNumbers = numbers(candidate);
  return reportNumbers.some((submitted) => candidateNumbers.some((documented) =>
    submitted > 0 && documented > 0 &&
    Math.abs(submitted - documented) / Math.max(submitted, documented) <= 0.05
  ));
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
    .filter((issue) => issue.score >= MIN_RELEVANCE_SCORE)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

// Split documentation into bounded passages and rank them without an LLM. This
// keeps Groq input small even when repository guides are long.
export function findRelatedDocuments(documents, title, description, limit = 4) {
  const report = `${title} ${description}`;
  const reportWords = words(report);

  return documents
    .flatMap((document) => document.content
      .split(/\n\s*\n/)
      .map((text) => text.trim())
      .filter((text) => text.length >= 40)
      .map((text, index) => ({
        path: document.path,
        url: document.url,
        sha: document.sha,
        passage: text.slice(0, 1200),
        passageIndex: index,
      })))
    .map((document) => {
      const matches = sharedWords(reportWords, words(`${document.path} ${document.passage}`));
      // Numeric proximity is especially useful for quotas, versions, ports,
      // and limits: 998 requests should surface a documented 1,000/day quota.
      const nearbyNumber = hasNearbyNumber(report, document.passage);
      return {
        ...document,
        score: matches.length + (nearbyNumber ? 3 : 0),
        matchedTerms: [...matches, ...(nearbyNumber ? ["nearby numeric value"] : [])],
      };
    })
    .filter((document) => document.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

// Source files are fetched only when the report explicitly names a path. This
// prevents RootLore from indexing an entire repository or guessing which code
// might be relevant.
export function extractReferencedPaths(value, limit = 3) {
  const matches = value.matchAll(
    /(?:^|[\s`'"(])((?:packages|src|lib|app|server|client|core|services|components|utils|data|config|configs|resources)\/[a-z0-9_./-]+\.(?:jsonc|json|yaml|toml|tsx|jsx|mjs|cjs|cpp|yml|ini|ts|js|py|java|go|rs|rb|php|cs|c|h))(?:[:#]L?\d+(?:-L?\d+)?)?(?=$|[\s`'"),.;])/gim,
  );
  return [...new Set([...matches].map((match) => match[1]))].slice(0, limit);
}

export function findRelatedSourcePassages(files, title, description, limit = 3) {
  const reportWords = words(`${title} ${description}`);

  return files
    .flatMap((file) => {
      const lines = file.content.split("\n");
      const passages = [];
      for (let start = 0; start < lines.length; start += 20) {
        const passage = lines.slice(start, start + 30).join("\n").trim();
        if (passage) passages.push({
          path: file.path,
          url: `${file.url}#L${start + 1}`,
          sha: file.sha,
          passage,
          passageIndex: start,
          sourceType: "source",
          startLine: start + 1,
        });
      }
      return passages;
    })
    .map((item) => {
      const matches = sharedWords(reportWords, words(`${item.path} ${item.passage}`));
      return { ...item, score: matches.length, matchedTerms: matches };
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

function editDistance(first, second) {
  const rows = Array.from({ length: first.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= second.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[first.length][second.length];
}

// Compare install commands in the report with exact command lines in repository
// documentation. Only a one-character executable typo is accepted, and package
// terms must overlap, preventing unrelated command guesses.
export function findDocumentedCommandCorrections(documents, report, limit = 2) {
  const submittedCommands = report
    .split("\n")
    .flatMap((line) => line.match(/(?:npm|nam|npx|pnpm|yarn|pip|cargo|go)\s+(?:install|add|get)\b[^\n`'"]*/gi) || [])
    .map((command) => command.trim());
  const corrections = [];

  for (const document of documents) {
    const documentedCommands = document.content
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*$>]\s*)?/, "").replace(/`/g, "").trim())
      .filter((line) => /^(?:npm|npx|pnpm|yarn|pip|cargo|go)\s+(?:install|add|get)\b/i.test(line));

    for (const submittedCommand of submittedCommands) {
      const submittedParts = submittedCommand.split(/\s+/);
      for (const documentedCommand of documentedCommands) {
        const documentedParts = documentedCommand.split(/\s+/);
        const sharedArguments = submittedParts.slice(1).filter((part) =>
          documentedParts.slice(1).some((candidate) => candidate.toLowerCase() === part.toLowerCase())
        );
        if (editDistance(submittedParts[0].toLowerCase(), documentedParts[0].toLowerCase()) === 1 &&
            sharedArguments.length >= 2) {
          corrections.push({
            submittedCommand,
            documentedCommand,
            path: document.path,
            url: document.url,
            sha: document.sha,
            passage: documentedCommand,
            passageIndex: -1,
            sourceType: "documentation",
            commandCorrection: true,
            matchedTerms: sharedArguments,
          });
        }
      }
    }
  }

  return corrections.slice(0, limit);
}
