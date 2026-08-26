import { useMemo, useState } from "react";
import {
  ArrowRight, Check, ExternalLink, FileCheck2, GitMerge, Link2, Menu,
  Search, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import { analyzeQuality } from "./quality.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Convert a normal GitHub URL into values accepted by the backend route.
function parseRepository(value) {
  try {
    const url = new URL(value);
    if (!["github.com", "www.github.com"].includes(url.hostname)) return null;
    const [owner, name] = url.pathname.split("/").filter(Boolean);
    return owner && name ? { owner, name: name.replace(/\.git$/, "") } : null;
  } catch {
    return null;
  }
}

function Logo() {
  return <div className="logo-shape"><span/><span/></div>;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("rootlore-history")) || [];
  } catch {
    return [];
  }
}

export default function App() {
  const [menu, setMenu] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState("https://github.com/facebook/react");
  const [title, setTitle] = useState("Application crashes on Windows");
  const [description, setDescription] = useState(
    "Version 19.0 crashes on Windows when I open developer tools. The console shows an error.",
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const repository = useMemo(() => parseRepository(repositoryUrl), [repositoryUrl]);

  // Send the report to the backend RAG endpoint and store its GenAI response.
  async function analyze() {
    if (!repository || !title.trim() || !description.trim()) return;
    setLoading(true);
    setResults(null);
    setFeedback("");
    setError("");
    const started = performance.now();

    try {
      const response = await fetch(
        `${API_URL}/api/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      const completedAnalysis = {
        ...data,
        quality: analyzeQuality(title, description),
        elapsed: ((performance.now() - started) / 1000).toFixed(1),
      };
      setResults(completedAnalysis);

      const historyEntry = {
        id: Date.now(),
        repository: data.repository,
        title,
        summary: data.analysis.summary,
        confidence: data.analysis.confidence,
        createdAt: new Date().toISOString(),
      };
      const updatedHistory = [historyEntry, ...history].slice(0, 10);
      setHistory(updatedHistory);
      localStorage.setItem("rootlore-history", JSON.stringify(updatedHistory));
    } catch (reason) {
      setError(reason.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="site-shell">
    <div className="ambient one"/><div className="ambient two"/>
    <header className="navbar">
      <a className="brand" href="#top"><Logo/><span>RootLore</span></a>
      <nav className={menu ? "nav-links open" : "nav-links"}>
        <a className="active" href="#workspace">Workspace</a>
        <a href="#analysis-history">History</a><a href="#knowledge">Knowledge</a>
        <button className="nav-close" onClick={() => setMenu(false)}><X size={18}/></button>
      </nav>
      <div className="nav-actions">
        <button className="repository-pill"><span className="repo-orb">{repository?.owner?.[0]?.toUpperCase() || "R"}</span>{repository ? `${repository.owner}/${repository.name}` : "Choose repository"}</button>
        <div className="user-avatar">AK</div>
        <button className="menu-button" onClick={() => setMenu(true)}><Menu size={20}/></button>
      </div>
    </header>

    <main id="top">
      <section className="hero" id="workspace">
        <div className="hero-copy"><div className="kicker"><Sparkles size={14}/>GenAI repository intelligence</div><h1>Turn issue history into <em>clear answers.</em></h1><p>Retrieve real project evidence and use GenAI to improve reports, identify duplicates, and suggest grounded solutions.</p></div>
        <div className="sync-card"><span className="sync-icon"><Check size={16}/></span><div><strong>RAG analysis ready</strong><small>GitHub evidence · Groq generation</small></div><ArrowRight size={16}/></div>
      </section>

      <section className="analysis-panel">
        <div className="panel-topline"><div><span className="step-label">01 · NEW ANALYSIS</span><h2>What happened?</h2></div><span className="privacy-note"><ShieldCheck size={14}/>Evidence-only AI</span></div>
        <label className="repository-field"><span>GitHub repository URL</span><div className="url-input"><GitMerge size={18}/><input type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repository"/></div><small>RootLore retrieves recent issues and gives only relevant evidence to the model.</small></label>
        <div className="form-grid">
          <label><span>Issue title</span><input value={title} onChange={(event) => setTitle(event.target.value)}/></label>
          <label className="description-field"><span>Description</span><textarea rows="4" value={description} onChange={(event) => setDescription(event.target.value)}/><small>{description.length} characters</small></label>
        </div>
        {!repository && repositoryUrl && <p className="form-error">Enter a valid github.com/owner/repository URL.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-footer"><p>The model must cite supplied GitHub evidence.</p><button className="analyze-button" onClick={analyze} disabled={loading || !repository || !title.trim() || !description.trim()}>{loading ? <><span className="spinner"/>Generating analysis</> : <><Search size={17}/>Analyze with GenAI<ArrowRight size={16}/></>}</button></div>
      </section>

      {results && <Results data={results} feedback={feedback} setFeedback={setFeedback}/>} 
      <History entries={history}/>
    </main>
  </div>;
}

function Results({ data, feedback, setFeedback }) {
  const ai = data.analysis;
  const missing = data.quality.checks.filter(([, present]) => !present).length;
  const improvedQuality = analyzeQuality(ai.improvedTitle, ai.improvedDescription);
  const outcomeType = ai.outcome?.type || (ai.suggestedSolution
    ? "verified_solution"
    : ai.inferredSolution
      ? "inferred_solution"
      : ai.possibleRemediation
        ? "possible_remediation"
        : "structured_issue");
  const citations = (ai.evidenceClaims?.length || 0) + (ai.documentationClaims?.length || 0);
  const solutionCitations = [
    ...(ai.evidenceClaims || []),
    ...(ai.documentationClaims || []),
  ].filter((claim) => claim.supports?.includes("solution")).length;
  const contextCitations = citations - solutionCitations;
  const outcomeMeta = {
    verified_solution: ["Repository verified", "Supported by repository evidence", "The action is backed by exact documentation or a confirmed issue resolution.", "Strong evidence"],
    inferred_solution: ["AI inference", "Grounded, but not directly confirmed", "Repository evidence supports the diagnosis; review the AI-derived action before applying it.", "Review required"],
    possible_remediation: ["Unverified direction", "Plausible next step", "The approach may help, but repository evidence does not confirm it as a solution.", "Limited evidence"],
    structured_issue: ["Diagnosis incomplete", "More evidence is needed", "No fix can be supported yet. Follow the diagnostic checklist, then analyze again.", "No supported fix"],
  }[outcomeType];

  return <section className="results-section">
    <div className="section-heading"><div><span className="step-label">02 · ROOTLORE RESULT</span><h2>{ai.outcome?.title || "Repository-grounded assistance"}</h2></div><span className="analysis-time">Model: {data.model} · {data.elapsed} seconds</span></div>
    <div className="results-layout">
      <article className="quality-card surface-card">
        <div className="card-heading"><div className="soft-icon blush"><FileCheck2 size={19}/></div><div><h3>Issue quality</h3><p>{missing} details need attention</p></div><div className="quality-score"><strong>{data.quality.score}</strong><span>/100</span></div></div>
        <div className="check-grid">{data.quality.checks.map(([label, present]) => <div className={present ? "check-row found" : "check-row missing"} key={label}><span>{present ? <Check size={13}/> : "·"}</span><p>{label}</p><small>{present ? "Found" : "Missing"}</small></div>)}</div>
        <div className="follow-up"><span>AI follow-up questions</span>{ai.followUpQuestions.length ? ai.followUpQuestions.slice(0, 3).map((question) => <p key={question}>{question}</p>) : <p>No additional questions suggested.</p>}</div>
      </article>

      <article className={`solution-card surface-card outcome-${outcomeType}`}>
        <div className="solution-glow"/><div className="card-heading"><div className="soft-icon navy"><ShieldCheck size={19}/></div><div><h3>GenAI analysis</h3><p>{ai.summary}</p></div><span className="confidence"><i/>{ai.confidence} confidence</span></div>
        <div className="verdict-bar"><span className="verdict-mark"><ShieldCheck size={18}/></span><div><small>{outcomeMeta[0]}</small><strong>{outcomeMeta[1]}</strong><p>{outcomeMeta[2]}</p></div><div className="verdict-proof"><strong>{outcomeMeta[3]}</strong><small>{solutionCitations} solution · {contextCitations} context</small></div></div>
        <div className="solution-summary"><span><Sparkles size={20}/></span><div><small>{ai.suggestedSolution ? "VERIFIED SOLUTION" : ai.inferredSolution ? "AI-INFERRED SOLUTION · REVIEW FIRST" : ai.possibleRemediation ? "POSSIBLE REMEDIATION · UNVERIFIED" : "ACTION PLAN"}</small><h3>{ai.possibleDuplicate ? `Possible duplicate of #${ai.possibleDuplicate}` : ai.inferredSolution ? "Grounded technical inference" : ai.possibleRemediation ? "AI-proposed direction" : "What to do next"}</h3><p>{ai.outcome?.message || ai.suggestedSolution || ai.inferredSolution || ai.possibleRemediation || "Add the missing diagnostic evidence and analyze again."}</p></div></div>
        {ai.evidenceClaims?.length > 0 && <div className="claim-list"><small>VALIDATED SUPPORTING CLAIMS</small>{ai.evidenceClaims.map((item) => <div className="claim-row" key={`${item.issueNumber}-${item.claim}`}><strong>{item.claim}</strong><p>“{item.supportingQuote}”</p><span>Verified in issue #{item.issueNumber} · supports {item.supports.join(", ")}</span></div>)}</div>}
        {ai.documentationClaims?.length > 0 && <div className="claim-list"><small>VALIDATED DOCUMENTATION CLAIMS</small>{ai.documentationClaims.map((item) => <div className="claim-row" key={`${item.path}-${item.claim}`}><strong>{item.claim}</strong><p>“{item.supportingQuote}”</p><a href={item.url} target="_blank" rel="noreferrer">{item.path} <ExternalLink size={12}/></a></div>)}</div>}
        <div className="evidence-trail"><div className="improved-report"><small>IMPROVED TITLE</small><strong>{ai.improvedTitle}</strong><small>IMPROVED DESCRIPTION</small><p className="formatted-description">{ai.improvedDescription}</p><small>IMPROVED REPORT QUALITY</small><strong>{improvedQuality.score}/100 · {improvedQuality.checks.filter(([, present]) => !present).length} details still missing</strong></div></div>
      </article>
    </div>

    <article className="related-card surface-card" id="evidence">
      <div className="card-heading related-heading"><div className="soft-icon lilac"><Link2 size={19}/></div><div><h3>Retrieved GitHub evidence</h3><p>Issues and documentation selected before generation</p></div></div>
      <div className="match-list">{data.relatedIssues.length ? data.relatedIssues.map((issue) => <a className="match-row" href={issue.url} target="_blank" rel="noreferrer" key={issue.number}><span className="match-number">#{issue.number}</span><div><h4>{issue.title}</h4><p>{issue.state} · {issue.discussion.length} comments loaded · {issue.labels.slice(0, 3).join(", ") || "no labels"}</p></div><span className={ai.evidenceIssueNumbers.includes(issue.number) ? "match-tag duplicate" : "match-tag"}>{ai.evidenceIssueNumbers.includes(issue.number) ? "AI citation" : "Retrieved"}</span><strong>{issue.score}%</strong><ExternalLink size={15}/></a>) : <p className="empty-state">No related issues were found. The AI was instructed not to invent evidence.</p>}</div>
      {data.relatedDocuments?.length > 0 && <div className="match-list">{data.relatedDocuments.map((document) => <a className="match-row" href={document.url} target="_blank" rel="noreferrer" key={`${document.path}-${document.passageIndex}`}><span className="match-number">DOC</span><div><h4>{document.path}</h4><p>{document.passage.slice(0, 150)}{document.passage.length > 150 ? "…" : ""}</p></div><span className="match-tag">Documentation</span><strong>{document.matchedTerms.length} terms</strong><ExternalLink size={15}/></a>)}</div>}
      {data.relatedFiles?.length > 0 && <div className="match-list">{data.relatedFiles.map((file) => <a className="match-row" href={file.url} target="_blank" rel="noreferrer" key={`${file.path}-${file.startLine}`}><span className="match-number">CODE</span><div><h4>{file.path}:{file.startLine}</h4><p>{file.passage.slice(0, 150)}{file.passage.length > 150 ? "…" : ""}</p></div><span className="match-tag duplicate">Referenced source</span><strong>{file.matchedTerms.length} terms</strong><ExternalLink size={15}/></a>)}</div>}
    </article>

    <div className="bottom-row" id="knowledge">
      <article className="coverage-card surface-card"><div><span className="step-label">RAG PIPELINE</span><h3>Retrieved, verified, then decided.</h3><p>RootLore searches repository history, documentation, and explicitly referenced source files before choosing solve or escalate.</p></div><div className="coverage-stats"><span><strong>{data.issuesAnalyzed}</strong><small>Issues read</small></span><span><strong>{data.relatedIssues.reduce((total, issue) => total + issue.discussion.length, 0)}</strong><small>Comments</small></span><span><strong>{(data.relatedDocuments?.length || 0) + (data.relatedFiles?.length || 0)}</strong><small>Repo passages</small></span><span><strong>{data.releases.length}</strong><small>Releases</small></span></div></article>
      <article className="feedback-card surface-card"><div className="soft-icon blush"><Sparkles size={19}/></div><div><h3>Was this useful?</h3><p>Your feedback evaluates the AI result.</p></div><div className="feedback-actions"><button className={feedback === "yes" ? "selected" : ""} onClick={() => setFeedback("yes")}><ThumbsUp size={15}/>Yes</button><button className={feedback === "no" ? "selected no" : ""} onClick={() => setFeedback("no")}><ThumbsDown size={15}/>Not quite</button></div></article>
    </div>
  </section>;
}

function History({ entries }) {
  return <section className="history-section" id="analysis-history">
    <div className="section-heading"><div><span className="step-label">ANALYSIS HISTORY</span><h2>Recent GenAI reports</h2></div><span className="analysis-time">Stored only in this browser</span></div>
    <article className="related-card surface-card">
      {entries.length ? entries.map((entry) => <div className="history-row" key={entry.id}><div><strong>{entry.title}</strong><p>{entry.summary}</p></div><span>{entry.repository}</span><small>{entry.confidence} confidence · {new Date(entry.createdAt).toLocaleString()}</small></div>) : <p className="empty-state">Your last ten completed analyses will appear here.</p>}
    </article>
  </section>;
}
