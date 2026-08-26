let activeTab;
let currentIssue;
let currentResult;
const byId = (id) => document.getElementById(id);

function show(id) {
  ["unsupported", "input", "loading", "result"].forEach((name) => byId(name).classList.toggle("hidden", name !== id));
}

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    currentIssue = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_GITHUB_ISSUE" });
  } catch {
    // A tab that was already open when the extension was installed/reloaded does
    // not yet contain the manifest content script. Inject it once and retry.
    if (activeTab.url?.startsWith("https://github.com/")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ["content/github-content.js"],
        });
        currentIssue = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_GITHUB_ISSUE" });
      } catch { currentIssue = null; }
    } else {
      currentIssue = null;
    }
  }
  if (!currentIssue) return show("unsupported");

  byId("mode").textContent = currentIssue.mode === "create" ? "New issue draft detected" : "Existing issue detected";
  byId("repository").textContent = `${currentIssue.owner}/${currentIssue.repository}`;
  byId("number").textContent = currentIssue.issueNumber ? `#${currentIssue.issueNumber}` : "Draft";
  byId("title").value = currentIssue.title;
  byId("description").value = currentIssue.description;
  // Long issue bodies should always open at their beginning. Chrome can retain
  // a textarea's previous scroll position while the popup stays mounted.
  requestAnimationFrame(() => {
    byId("description").scrollTop = 0;
    byId("description").setSelectionRange(0, 0);
  });
  show("input");
}

byId("analyze").addEventListener("click", async () => {
  currentIssue = { ...currentIssue, title: byId("title").value.trim(), description: byId("description").value.trim() };
  if (!currentIssue.title || !currentIssue.description) {
    byId("error").textContent = "Add both a title and description first.";
    return;
  }
  show("loading");
  const response = await chrome.runtime.sendMessage({ type: "ANALYZE_ISSUE", issue: currentIssue });
  if (!response.ok) {
    show("input");
    byId("error").textContent = response.error;
    return;
  }
  renderResult(response.result);
});

function renderResult(data) {
  currentResult = data;
  const ai = data.analysis;
  const outcome = ai.outcome || {
    type: ai.suggestedSolution ? "verified_solution" : ai.inferredSolution ? "inferred_solution" : ai.possibleRemediation ? "possible_remediation" : "structured_issue",
    title: ai.suggestedSolution ? "Repository-supported solution" : ai.inferredSolution ? "AI-inferred solution" : ai.possibleRemediation ? "Possible remediation" : "No supported solution found",
    message: ai.suggestedSolution || ai.inferredSolution || ai.possibleRemediation || "Use the structured report to ask the repository maintainers.",
  };
  const citations = (ai.evidenceClaims?.length || 0) + (ai.documentationClaims?.length || 0);
  const solutionCitations = [...(ai.evidenceClaims || []), ...(ai.documentationClaims || [])]
    .filter((claim) => claim.supports?.includes("solution")).length;
  const contextCitations = citations - solutionCitations;
  const verdicts = {
    verified_solution: ["REPOSITORY VERIFIED", "Supported solution", "Exact repository evidence supports this action.", "Strong"],
    inferred_solution: ["AI INFERENCE", "Grounded, review first", "Evidence supports the diagnosis, but the action is AI-derived.", "Review"],
    possible_remediation: ["UNVERIFIED DIRECTION", "Plausible next step", "Useful to try, but repository evidence does not confirm it.", "Limited"],
    structured_issue: ["DIAGNOSIS INCOMPLETE", "More evidence needed", "Follow the diagnostic checklist, then analyze again.", "None"],
  };
  const verdict = verdicts[outcome.type] || verdicts.structured_issue;
  byId("summary").textContent = ai.summary;
  byId("confidence").textContent = `${ai.confidence} confidence`;
  byId("outcomeLabel").textContent = ["verified_solution", "inferred_solution"].includes(outcome.type) ? "SOLUTION FOUND" : "ISSUE ASSISTANCE";
  byId("solutionLabel").textContent = outcome.type === "verified_solution" ? "VERIFIED REPOSITORY GUIDANCE" : outcome.type === "inferred_solution" ? "AI-INFERRED · REVIEW BEFORE APPLYING" : outcome.type === "possible_remediation" ? "UNVERIFIED TECHNICAL DIRECTION" : "ESCALATE TO MAINTAINERS";
  byId("outcomeTitle").textContent = outcome.title;
  byId("solution").textContent = outcome.message;
  byId("solution").closest(".solution").dataset.outcome = outcome.type;
  byId("verdict").dataset.outcome = outcome.type;
  byId("verdictEyebrow").textContent = verdict[0];
  byId("verdictTitle").textContent = verdict[1];
  byId("verdictDetail").textContent = verdict[2];
  byId("verdictEvidence").textContent = `${verdict[3]} · ${solutionCitations} solution · ${contextCitations} context`;
  byId("duplicate").textContent = ai.possibleDuplicate ? `#${ai.possibleDuplicate}` : "None";
  byId("documents").textContent = (ai.evidenceClaims?.length || 0) +
    (ai.documentationClaims?.length || 0);
  byId("cached").textContent = data.cached ? "Yes" : "No";
  byId("improvedTitle").value = ai.improvedTitle;
  byId("improvedDescription").value = ai.improvedDescription;
  byId("improvedIssue").open = outcome.type !== "verified_solution";
  requestAnimationFrame(() => {
    byId("improvedDescription").scrollTop = 0;
    byId("improvedDescription").setSelectionRange(0, 0);
  });
  byId("missing").replaceChildren(...ai.followUpQuestions.slice(0, 3).map((question) => {
    const chip = document.createElement("span"); chip.textContent = question; return chip;
  }));
  byId("insert").classList.toggle("hidden", currentIssue.mode !== "create");
  show("result");
}

byId("copy").addEventListener("click", async () => {
  const ai = currentResult.analysis;
  await navigator.clipboard.writeText(`${ai.improvedTitle}\n\n${ai.improvedDescription}`);
  byId("copy").textContent = "Copied";
});
byId("insert").addEventListener("click", async () => {
  const ai = currentResult.analysis;
  const response = await chrome.tabs.sendMessage(activeTab.id, { type: "INSERT_IMPROVED_ISSUE", title: ai.improvedTitle, description: ai.improvedDescription });
  byId("insert").textContent = response.inserted ? "Inserted — review before submitting" : "Could not find GitHub form";
});
byId("again").addEventListener("click", () => show("input"));
byId("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
initialize();
