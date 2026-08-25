const issue = (number, title, body, labels = []) => ({
  id: number,
  number,
  title,
  body,
  labels,
  comments: 0,
  state: "closed",
  url: `https://github.com/example/project/issues/${number}`,
});

// Small labeled fixtures make retrieval quality measurable and reproducible.
export const retrievalCases = [
  {
    name: "authentication error code",
    title: "Login returns 401 on Windows",
    description: "The refresh token fails after it expires.",
    expectedIssue: 101,
    issues: [
      issue(101, "Refresh token returns 401 on Windows", "Token renewal fails after expiration", ["bug", "auth"]),
      issue(102, "Windows button alignment", "Login button has incorrect spacing", ["ui"]),
    ],
  },
  {
    name: "database connection timeout",
    title: "Database request times out",
    description: "PostgreSQL connection fails after 30 seconds with TimeoutError.",
    expectedIssue: 201,
    issues: [
      issue(201, "PostgreSQL connection TimeoutError", "Database pool stops responding after 30 seconds", ["database"]),
      issue(202, "HTTP request timeout", "External API is slow", ["network"]),
    ],
  },
  {
    name: "mobile crash",
    title: "Application crashes on Android",
    description: "Opening the camera causes a crash in version 4.2.0.",
    expectedIssue: 301,
    issues: [
      issue(301, "Android camera crash", "Camera screen fails in version 4.2.0", ["android", "bug"]),
      issue(302, "iOS gallery is empty", "Photos are not displayed", ["ios"]),
    ],
  },
  {
    name: "build failure",
    title: "Production build fails",
    description: "Vite reports ModuleNotFoundError when running the build.",
    expectedIssue: 401,
    issues: [
      issue(401, "Vite build ModuleNotFoundError", "Production compilation cannot resolve a module", ["build"]),
      issue(402, "Development server reload", "Hot reload runs twice", ["dev-server"]),
    ],
  },
];
