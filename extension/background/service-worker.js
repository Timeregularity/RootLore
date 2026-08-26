const DEFAULT_API_URL = "http://localhost:3000";

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "ANALYZE_ISSUE") return false;

  analyze(message.issue)
    .then((result) => respond({ ok: true, result }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});

async function analyze(issue) {
  const { apiUrl = DEFAULT_API_URL } = await chrome.storage.sync.get("apiUrl");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/api/repositories/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repository)}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issue.title,
          description: issue.description,
          issueNumber: issue.issueNumber,
        }),
        signal: controller.signal,
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Analysis failed (${response.status})`);
    await chrome.storage.local.set({ lastAnalysis: data });
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Analysis timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
