# RootLore

RootLore is a GitHub issue assistant that improves incomplete bug reports and finds evidence-backed solutions in a repository's history.

## Current milestone

The first milestone is a small Express API that fetches and cleans issues from a public GitHub repository.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Run the React frontend in a second terminal:

```bash
cd web
npm install
npm run dev
```

Then open `http://localhost:5173`.

Test the health endpoint:

```text
http://localhost:3000/health
```

Fetch public repository issues:

```text
http://localhost:3000/api/repositories/facebook/react/issues
```

The GitHub token in `.env` is optional for this first milestone. Never commit the `.env` file.

## Request flow

```text
Browser
  -> Express route
  -> GitHub service
  -> GitHub REST API
  -> cleaned issue objects
  -> JSON response
```
