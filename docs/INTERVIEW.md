# RootLore interview guide

## 60-second explanation

RootLore is a GenAI GitHub issue assistant built with React, Express, the GitHub
REST API, and Groq. A user submits an issue draft and repository URL. The backend
retrieves up to 300 recent GitHub records, removes pull requests, and ranks issues
using explainable weighted lexical matching. It enriches the five best matches
with comments, timelines, linked pull-request references, commits, and releases.
Only this selected evidence is sent to the LLM. Groq returns strict JSON, and the
backend validates every cited issue number before showing the answer. This is a
RAG pipeline with explicit hallucination controls rather than a chatbot wrapper.

## Why RAG is used

The model does not know the latest or private state of a repository and may invent
fixes. Retrieval supplies current project evidence. Limiting context to five
issues also lowers latency and token usage compared with sending the whole
repository.

## Important engineering decisions

### Weighted lexical retrieval

Title matches receive more weight than body matches because issue titles usually
contain the clearest symptom. Labels receive medium weight and exact error codes
receive a bonus. This approach is inexpensive, deterministic, and explainable.

### Strict structured output

Groq constrains the response with JSON Schema. React can therefore render known
fields without parsing free-form prose.

### Citation validation

Prompt instructions alone are not a security boundary. After generation, the
backend removes issue numbers that were not in the retrieved evidence. A solution
without any verified issue citation is removed and confidence is reduced to low.

### Controlled API usage

RootLore fetches comments and timelines only for the top five issues. Repository
issues are cached for five minutes. Optional evidence failures do not prevent a
basic analysis from completing.

### Evaluation

`npm run evaluate` executes labeled retrieval cases and reports top-1 accuracy.
This makes retrieval changes measurable instead of relying only on visual demos.

## Current trade-offs

- Lexical matching is transparent but misses synonyms and conceptual similarity.
- In-memory caching is simple but resets when the backend restarts.
- Browser history avoids authentication and database complexity but is local to
  one browser.
- Only three pages of GitHub records are searched to control latency and quotas.
- AI output is grounded and validated, but still requires human review.

## Natural future improvements

- Generate embeddings for semantic retrieval and compare them with lexical scores.
- Persist repository snapshots and user history in PostgreSQL.
- Use GitHub App authentication for multi-user private-repository access.
- Evaluate duplicate detection and answer groundedness on a larger labeled set.
- Deploy the frontend and backend with secret management and monitoring.

## Likely questions

### Is this just an API wrapper?

No. The core work includes GitHub retrieval, ranking, context selection, comment
and timeline enrichment, strict output design, citation verification, caching,
error handling, and evaluation. The LLM is one stage in a larger pipeline.

### How do you reduce hallucinations?

Evidence-only prompting, limited retrieved context, strict JSON Schema, citation
allow-listing, duplicate validation, and removal of uncited solutions.

### Why not send all issues to the model?

It would increase cost, latency, context noise, and the risk of selecting weak
evidence. Retrieval narrows the prompt to relevant history.

### Why not start with embeddings?

Weighted lexical retrieval is easier to explain, test, and evaluate in an MVP.
Embeddings are a logical next step after establishing a deterministic baseline.

### What metric do you currently use?

Top-1 retrieval accuracy on labeled fixtures. A larger version should also track
recall at five, citation precision, groundedness, latency, and token usage.
