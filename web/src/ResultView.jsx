import { AlertTriangle, Check, Copy, ExternalLink, Link2, RotateCcw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { analyzeQuality } from "./quality.js";
import { getResultModel } from "./resultModel.js";

export function copyText(value) {
  if (value) navigator.clipboard?.writeText(value);
}

export function CodeBlock({ label, code }) {
  if (!code) return null;
  return <div className="code-panel"><div><span>{label}</span><button onClick={() => copyText(code)} aria-label={`Copy ${label.toLowerCase()}`}><Copy size={13}/>Copy</button></div><pre><code>{code}</code></pre></div>;
}

const OUTCOMES = {
  verified_solution: { eyebrow: "VERIFIED FIX", evidence: "VERIFIED", heading: "Apply the repository-supported fix", detail: "The action is backed by exact documentation or a confirmed issue resolution." },
  inferred_solution: { eyebrow: "PROPOSED FIX · REVIEW FIRST", evidence: "GROUNDED INFERENCE", heading: "Review before applying", detail: "Repository evidence supports the direction, but does not directly confirm this exact action." },
  possible_remediation: { eyebrow: "TROUBLESHOOTING · UNVERIFIED", evidence: "NOT VERIFIED", heading: "Try this cautiously", detail: "This is a safe direction to investigate, not a repository-confirmed fix." },
  structured_issue: { eyebrow: "MORE INFORMATION NEEDED", evidence: "INSUFFICIENT", heading: "Strengthen the report", detail: "No fix can be supported yet. Collect the missing diagnostics before trying changes." },
};

function confidenceReason(type, confidence) {
  if (type === "verified_solution") return confidence === "high" ? "The proposed action and diagnosis are directly supported by validated repository evidence." : "Exact repository evidence supports the fix, but some diagnostic details were not provided.";
  if (type === "inferred_solution") return "Validated repository context supports the direction, but the exact fix is an inference.";
  return "The available evidence does not directly confirm a fix for this report.";
}

export default function ResultView({ data, feedback, setFeedback, analyzeAgain }) {
  const { ai, outcomeType, selectedSolution, plan, solutionCitations, contextCitations, steps, verification } = getResultModel(data);
  const meta = OUTCOMES[outcomeType];
  const missingChecks = data.quality.checks.filter(([, present]) => !present);
  const improvedQuality = analyzeQuality(ai.improvedTitle, ai.improvedDescription);
  const fixCopy = steps.map((step, index) => `${index + 1}. ${step.title}\n${step.instruction}${step.code ? `\n${step.code}` : ""}`).join("\n\n");
  const evidence = [...(ai.evidenceClaims || []).map((claim) => ({ ...claim, source: `Issue #${claim.issueNumber}`, url: data.relatedIssues.find((issue) => issue.number === claim.issueNumber)?.url })), ...(ai.documentationClaims || []).map((claim) => ({ ...claim, source: claim.path }))];

  return <section className="results-section">
    <div className="section-heading"><div><span className="step-label">02 · ROOTLORE RESULT</span><h2>{ai.outcome?.title || "Repository-grounded assistance"}</h2></div><span className="analysis-time">Model: {data.model} · {data.elapsed} seconds</span></div>
    <article className={`action-card surface-card outcome-${outcomeType}`}>
      <header className="action-header"><div><span className="outcome-label">{meta.eyebrow}</span><h3>{meta.heading}</h3><p>{meta.detail}</p></div><div className="trust-summary"><span>Evidence status <strong>{meta.evidence}</strong></span><span>Confidence <strong>{ai.confidence.toUpperCase()}</strong></span><small>{solutionCitations} solution · {contextCitations} context citations</small></div></header>
      <div className="diagnosis"><span>ROOT CAUSE</span><p>{plan?.diagnosis || ai.summary}</p></div>
      {outcomeType !== "structured_issue" ? <>
        <div className="solution-title"><div><span>WHAT TO DO</span><h3>{ai.possibleDuplicate ? `Review possible duplicate #${ai.possibleDuplicate}` : "Action plan"}</h3></div><button className="quiet-button" onClick={() => copyText(fixCopy)}><Copy size={14}/>Copy fix</button></div>
        <ol className="solution-steps">{steps.map((step, index) => <li key={`${step.title}-${index}`}><span>{index + 1}</span><div><h4>{step.title}</h4><p>{step.instruction}</p>{step.code && <CodeBlock label="Code" code={step.code}/>}</div></li>)}</ol>
        {(plan?.beforeCode || plan?.afterCode) && <div className="code-comparison"><CodeBlock label="Before" code={plan.beforeCode}/><CodeBlock label="After" code={plan.afterCode}/></div>}
        {plan?.whyItWorks && <details className="inline-disclosure"><summary>Why this works</summary><p>{plan.whyItWorks}</p></details>}
        {plan?.cautions?.length > 0 && <div className="caution"><AlertTriangle size={17}/><div><strong>Cautions</strong>{plan.cautions.map((item) => <p key={item}>{item}</p>)}</div></div>}
        <div className="verification"><span>VERIFY THE FIX</span>{verification.map((item) => <p key={item}><Check size={15}/>{item}</p>)}</div>
      </> : <div className="structured-primary"><p>{ai.outcome?.message}</p><button className="primary-action" onClick={analyzeAgain}><RotateCcw size={15}/>Improve and analyze again</button></div>}
    </article>

    <div className="secondary-grid"><article className="quality-card surface-card"><div className="quality-compact"><div><span>REPORT QUALITY</span><strong>{data.quality.score}<small>/100</small></strong></div><div><span>Missing</span>{missingChecks.length ? missingChecks.map(([label]) => <p key={label}>• {label}</p>) : <p>Nothing detected by the local checks.</p>}</div></div>{ai.followUpQuestions?.length > 0 && <details className="card-disclosure" open={outcomeType === "structured_issue"}><summary>Questions that would improve this report</summary>{ai.followUpQuestions.slice(0, 3).map((question) => <p key={question}>{question}</p>)}</details>}</article><article className="confidence-card surface-card"><span>WHY {ai.confidence.toUpperCase()} CONFIDENCE?</span><p>{confidenceReason(outcomeType, ai.confidence)}</p></article></div>

    <details className="evidence-card surface-card"><summary><span>Evidence supporting this result ({evidence.length})</span><small>Solution and context evidence are labelled separately</small></summary><div className="evidence-list">{evidence.length ? evidence.map((item, index) => { const solution = item.supports?.includes("solution"); return <article key={`${item.source}-${index}`}><div><span className={solution ? "evidence-badge solution" : "evidence-badge context"}>{solution ? "SOLUTION EVIDENCE" : "CONTEXT EVIDENCE"}</span><strong>{item.source}</strong></div><h4>{item.claim}</h4><blockquote>“{item.supportingQuote}”</blockquote><footer><span>Supports: {solution ? "Solution" : item.supports?.join(", ")}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer">Open evidence <ExternalLink size={12}/></a>}</footer></article> }) : <p className="empty-state">No validated claims were available for this result.</p>}</div></details>

    <details className={`report-card surface-card ${outcomeType === "structured_issue" ? "report-primary" : ""}`} open={outcomeType === "structured_issue"}><summary>Need to report this to maintainers?</summary><div><span>IMPROVED TITLE</span><strong>{ai.improvedTitle}</strong><span>IMPROVED DESCRIPTION</span><pre>{ai.improvedDescription}</pre><div className="report-footer"><small>Report quality {improvedQuality.score}/100 · {improvedQuality.checks.filter(([, present]) => !present).length} details still missing</small><button className="quiet-button" onClick={() => copyText(`${ai.improvedTitle}\n\n${ai.improvedDescription}`)}><Copy size={14}/>Copy report</button></div></div></details>

    <details className="related-card surface-card deep-disclosure" id="evidence"><summary>Retrieved GitHub evidence</summary><div className="card-heading related-heading"><div className="soft-icon lilac"><Link2 size={19}/></div><div><h3>Retrieved GitHub evidence</h3><p>Issues and documentation selected before generation</p></div></div><div className="match-list">{data.relatedIssues.length ? data.relatedIssues.map((issue) => <a className="match-row" href={issue.url} target="_blank" rel="noreferrer" key={issue.number}><span className="match-number">#{issue.number}</span><div><h4>{issue.title}</h4><p>{issue.state} · {issue.discussion.length} comments loaded · {issue.labels.slice(0, 3).join(", ") || "no labels"}</p></div><span className={ai.evidenceIssueNumbers.includes(issue.number) ? "match-tag duplicate" : "match-tag"}>{ai.evidenceIssueNumbers.includes(issue.number) ? "AI citation" : "Retrieved"}</span><strong>{issue.score}%</strong><ExternalLink size={15}/></a>) : <p className="empty-state">No related issues were found. The AI was instructed not to invent evidence.</p>}</div>{data.relatedDocuments?.length > 0 && <div className="match-list">{data.relatedDocuments.map((document) => <a className="match-row" href={document.url} target="_blank" rel="noreferrer" key={`${document.path}-${document.passageIndex}`}><span className="match-number">DOC</span><div><h4>{document.path}</h4><p>{document.passage.slice(0, 150)}{document.passage.length > 150 ? "…" : ""}</p></div><span className="match-tag">Documentation</span><strong>{document.matchedTerms.length} terms</strong><ExternalLink size={15}/></a>)}</div>}{data.relatedFiles?.length > 0 && <div className="match-list">{data.relatedFiles.map((file) => <a className="match-row" href={file.url} target="_blank" rel="noreferrer" key={`${file.path}-${file.startLine}`}><span className="match-number">CODE</span><div><h4>{file.path}:{file.startLine}</h4><p>{file.passage.slice(0, 150)}{file.passage.length > 150 ? "…" : ""}</p></div><span className="match-tag duplicate">Referenced source</span><strong>{file.matchedTerms.length} terms</strong><ExternalLink size={15}/></a>)}</div>}</details>

    <details className="pipeline-card surface-card"><summary>RAG pipeline details</summary><div className="coverage-stats"><span><strong>{data.issuesAnalyzed}</strong><small>Issues read</small></span><span><strong>{data.relatedIssues.reduce((total, issue) => total + issue.discussion.length, 0)}</strong><small>Comments</small></span><span><strong>{(data.relatedDocuments?.length || 0) + (data.relatedFiles?.length || 0)}</strong><small>Repo passages</small></span><span><strong>{data.releases.length}</strong><small>Releases</small></span></div></details>
    <article className="feedback-card surface-card result-feedback"><div className="soft-icon blush"><Sparkles size={19}/></div><div><h3>Was this useful?</h3><p>Your feedback evaluates the AI result.</p></div><div className="feedback-actions"><button className={feedback === "yes" ? "selected" : ""} onClick={() => setFeedback("yes")}><ThumbsUp size={15}/>Yes</button><button className={feedback === "no" ? "selected no" : ""} onClick={() => setFeedback("no")}><ThumbsDown size={15}/>Not quite</button></div></article>
  </section>;
}
