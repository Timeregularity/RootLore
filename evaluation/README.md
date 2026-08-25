# Retrieval evaluation protocol

The four bundled fixtures are deterministic regression tests. They must not be
presented as proof of real-world accuracy.

## Building a credible dataset

1. Select 5–10 active public repositories from different technology domains.
2. Sample 10–20 existing issues per repository.
3. Rewrite each issue as a shorter user report without copying its title.
4. Record the expected duplicate and up to five acceptable matches.
5. Include synonyms, renamed APIs, ambiguous issues, no-match cases, and older issues.
6. Have a second person review a subset of labels when possible.
7. Keep evaluation examples separate from examples used to tune scoring weights.

## Recommended record

```json
{
  "repository": "owner/name",
  "queryTitle": "User-written title",
  "queryDescription": "User-written report",
  "expectedIssueNumbers": [123],
  "shouldReturnNoMatch": false,
  "notes": "Reason this is a duplicate"
}
```

## Metrics

- Precision@1
- Recall@5
- Mean reciprocal rank
- No-match precision and recall
- Citation precision
- Claim groundedness rate
- Median and p95 latency
- GitHub requests per analysis
- Prompt and completion tokens

Always report dataset size with a metric, for example: “Recall@5: 78% on 60
queries across six repositories,” never simply “78% accurate.”
