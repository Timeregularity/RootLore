# RootLore

RootLore is a GenAI-powered GitHub issue intelligence application. It retrieves
relevant project history and uses retrieval-augmented generation (RAG) to improve
bug reports, identify possible duplicates, ask follow-up questions, and suggest
solutions supported by repository evidence.

## Why RootLore

Bug reports are often incomplete, while useful fixes are buried in old issues,
maintainer comments, linked pull requests, commits, and release notes. RootLore
selects a small evidence set before asking an LLM to answer, instead of treating
the model as an ungrounded chatbot.

## RAG architecture

```text
User report
   |
   v
React interface
   |
   v
Express analysis endpoint
   |
   +--> GitHub issues (up to 100 recent records, cached for 15 minutes)
   |       |
   |       +--> weighted issue retrieval (top 3)
   |       +--> comments for selected issues
   |       +--> timeline links and closing commits
   |       +--> recent repository releases
   |
   v
Evidence-limited Groq prompt
   |
   v
Strict structured JSON response
   |
   v
Citation validation and React results
```

## Main GenAI features

- Retrieval-augmented generation using live GitHub evidence
- Weighted retrieval using title, label, body, and error-code matches
- Groq inference with `openai/gpt-oss-20b`
- Strict JSON Schema output
- Improved issue title and description
- AI-generated follow-up questions
- Possible duplicate detection
- Confidence assessment
- Claim-level evidence with exact supporting quotes
- Evidence citations derived only from validated quotes
- Hallucination safeguards that remove unknown issues and unsupported quotes
- No suggested solution when the model provides no verified citation

## Supporting application features

- Dynamic issue-quality score
- GitHub issue comments and timeline retrieval
- Recent release evidence
- Loading, validation, empty, and API error states
- Responsive React interface
- Last ten analyses stored locally in the browser
- Automated retrieval and citation-validation tests
- ETag-aware GitHub response cache with request deduplication
- 15-minute issue cache and six-hour supporting-evidence cache
- 24-hour Groq result cache for identical reports and evidence
- Only three related issues are enriched, keeping API fan-out and prompts small
- External API timeouts and rate-limit-aware errors
- Per-IP analysis rate limiting and restricted CORS
- Reproducible retrieval evaluation with top-1 accuracy

## Technology

- JavaScript
- React and Vite
- Node.js and Express
- GitHub REST API
- Groq API
- CSS
- Node.js built-in test runner

## Local setup

Requirements: Node.js 20 or newer and npm.

1. Install backend dependencies:

   ```bash
   npm install
   ```

2. Install frontend dependencies:

   ```bash
   cd web
   npm install
   cd ..
   ```

3. Copy `.env.example` to `.env` and add private credentials:

   ```env
   PORT=3000
   GITHUB_TOKEN=
   GROQ_API_KEY=gsk_your_real_key
   CORS_ORIGINS=http://localhost:5173
   ```

   `GITHUB_TOKEN` is optional for public repositories. Authentication raises the
   GitHub API limit and enables repositories the token is allowed to read. Never
   commit `.env` or expose either token in frontend code.

4. Start the backend:

   ```bash
   npm run dev
   ```

5. Start the frontend in a second terminal:

   ```bash
   cd web
   npm run dev
   ```

6. Open the Vite URL, normally `http://localhost:5173`.

## API

Health check:

```http
GET /health
```

Normalized repository issues:

```http
GET /api/repositories/:owner/:repository/issues
```

GenAI analysis:

```http
POST /api/repositories/:owner/:repository/analyze
Content-Type: application/json

{
  "title": "Login returns 401 on Windows",
  "description": "Version 2.4.1 fails after the token expires."
}
```

The response includes repository statistics, retrieved issues, comments,
timeline evidence, releases, the model name, and validated structured analysis.

## Verification

Run backend tests:

```bash
npm test
```

Run the labeled retrieval evaluation:

```bash
npm run evaluate
```

Run tests, evaluation, and the production frontend build together:

```bash
npm run check
```

Build the frontend:

```bash
cd web
npm run build
```

## Hallucination controls

RootLore uses several layers rather than relying only on prompt instructions:

1. Only three retrieved issues are supplied as issue evidence.
2. The system prompt prohibits invented fixes, versions, links, and issue numbers.
3. Groq constrains output with a strict JSON Schema.
4. The model must return a claim, retrieved issue number, and exact quote.
5. Quotes are checked against retrieved titles, bodies, and comments.
6. Citations are derived from validated claims instead of trusted model output.
7. Unknown duplicate numbers are removed.
8. Solutions without verified quoted evidence are removed and confidence becomes low.

## Current limitations

- Retrieval intentionally uses the 100 most recent issues to protect API limits, so
  older issues may not be retrieved.
- Retrieval is explainable lexical matching, not embedding-based semantic search.
- Timeline data identifies linked pull requests and commits but does not download
  full diffs or source code.
- Browser history is local to one device and is not user-authenticated.
- Generated conclusions still require human review.
- The four bundled evaluation cases are a regression baseline, not a real-world
  accuracy claim. See [`evaluation/README.md`](evaluation/README.md).

## Placement summary

> Built a GenAI-powered GitHub issue intelligence system using RAG, weighted
> evidence retrieval, live issue discussions and timelines, strict structured
> LLM output, citation validation, and hallucination-aware solution generation.

See [`docs/INTERVIEW.md`](docs/INTERVIEW.md) for a project pitch, engineering
decisions, trade-offs, and common placement questions.
