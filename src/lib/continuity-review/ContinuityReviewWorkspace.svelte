<script lang="ts">
  import type { ContinuityReviewEvidence, ContinuityReviewModel } from "./types";

  export interface ContinuityReviewManuscriptOption {
    id: string;
    title: string;
  }

  interface Props {
    model: ContinuityReviewModel;
    manuscripts: readonly ContinuityReviewManuscriptOption[];
    loading: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onSelectScope: (manuscriptId: string | null) => void;
    onOpenSource: (evidence: ContinuityReviewEvidence) => void;
  }

  let {
    model,
    manuscripts,
    loading,
    onClose,
    onRefresh,
    onSelectScope,
    onOpenSource,
  }: Props = $props();

  let showSourceProblems = $state(true);
  let showContradictions = $state(true);
  let showReviews = $state(true);
  let showInformation = $state(true);

  const visibleFindings = $derived(
    model.findings.filter(({ severity }) =>
      severity === "contradiction"
        ? showContradictions
        : severity === "review"
          ? showReviews
          : showInformation,
    ),
  );
  const counts = $derived.by(() => ({
    source: model.sourceProblems.length,
    contradiction: model.findings.filter(({ severity }) => severity === "contradiction").length,
    review: model.findings.filter(({ severity }) => severity === "review").length,
    information: model.findings.filter(({ severity }) => severity === "information").length,
  }));
  const selectedScope = $derived(
    model.scope.kind === "manuscript" ? model.scope.manuscriptId : "",
  );

  function scopeChanged(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    onSelectScope(value || null);
  }

  function severityLabel(value: "information" | "review" | "contradiction"): string {
    if (value === "contradiction") return "Contradiction";
    if (value === "review") return "Review";
    return "Information";
  }

  function canonLabel(evidence: ContinuityReviewEvidence): string {
    return `${evidence.effectiveCanon ?? "canon unspecified"} · ${evidence.certainty ?? "certainty unspecified"}`;
  }
</script>

<section class="review-workspace" aria-labelledby="continuity-review-heading">
  <header>
    <div>
      <p class="eyebrow">Local, source-linked review</p>
      <h1 id="continuity-review-heading">Continuity review</h1>
      <p>Deterministic comparisons from structured project facts. Findings are evidence to review, not automatic story truth.</p>
    </div>
    <div class="workspace-actions">
      <button type="button" onclick={onRefresh} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      <button type="button" class="primary" onclick={onClose}>Return to draft</button>
    </div>
  </header>

  <section class="controls" aria-labelledby="review-controls-heading">
    <div class="scope-control">
      <label id="review-controls-heading" for="continuity-review-scope">Review scope</label>
      <select id="continuity-review-scope" value={selectedScope} onchange={scopeChanged}>
        <option value="">Whole world</option>
        {#each manuscripts as manuscript (manuscript.id)}
          <option value={manuscript.id}>{manuscript.title}</option>
        {/each}
      </select>
      <p>Manuscript scope uses only bound scene and chapter sources. It does not interpret synopsis, POV, location, story-date text, notes, or prose.</p>
    </div>
    <fieldset>
      <legend>Show</legend>
      <div class="filter-list">
        <label><input type="checkbox" bind:checked={showSourceProblems} /> Source problems <span>{counts.source}</span></label>
        <label><input type="checkbox" bind:checked={showContradictions} /> Contradictions <span>{counts.contradiction}</span></label>
        <label><input type="checkbox" bind:checked={showReviews} /> Reviews <span>{counts.review}</span></label>
        <label><input type="checkbox" bind:checked={showInformation} /> Information <span>{counts.information}</span></label>
      </div>
    </fieldset>
  </section>

  {#if model.omittedFindingCount > 0 || model.omittedSourceProblemCount > 0}
    <p class="limit-notice" role="status">
      {#if model.omittedFindingCount > 0}
        {model.omittedFindingCount} additional {model.omittedFindingCount === 1 ? "finding was" : "findings were"} omitted by deterministic limits.
      {/if}
      {#if model.omittedSourceProblemCount > 0}
        {model.omittedSourceProblemCount} additional source {model.omittedSourceProblemCount === 1 ? "problem was" : "problems were"} omitted.
      {/if}
    </p>
  {/if}

  {#if showSourceProblems}
    <section class="result-section" aria-labelledby="source-problems-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Unreadable or unusable evidence</p>
          <h2 id="source-problems-heading">Source problems</h2>
        </div>
        <span>{model.sourceProblems.length}</span>
      </div>
      {#if model.sourceProblems.length === 0}
        <p class="empty">No source problems are visible in this scope.</p>
      {:else}
        <ol class="result-list">
          {#each model.sourceProblems as problem (problem.id)}
            <li>
              <article class="result-card source-problem">
                <div class="card-heading">
                  <div>
                    <p class="result-kind">Source problem · {problem.family}</p>
                    <h3>{problem.summary}</h3>
                  </div>
                </div>
                <details>
                  <summary>Why this appeared</summary>
                  <p>{problem.explanation}</p>
                </details>
                <div class="evidence" aria-label={`Sources for ${problem.summary}`}>
                  {#each problem.evidence as item (`${item.stableId}:${item.path}:${item.sourceRange.start}`)}
                    <button type="button" onclick={() => onOpenSource(item)}>
                      Open {item.path} · line {item.sourceRange.line}
                    </button>
                  {/each}
                </div>
              </article>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}

  <section class="result-section" aria-labelledby="active-findings-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Deterministic comparisons</p>
        <h2 id="active-findings-heading">Active findings</h2>
      </div>
      <span>{visibleFindings.length} shown</span>
    </div>
    {#if visibleFindings.length === 0}
      <div class="empty">
        <p>No active findings match these filters.</p>
        <p>An empty review is not proof of complete continuity: optional facts, untracked prose, and bounded rules remain outside the result.</p>
      </div>
    {:else}
      <ol class="result-list">
        {#each visibleFindings as finding (finding.id)}
          <li>
            <article class="result-card" class:contradiction={finding.severity === "contradiction"} class:review={finding.severity === "review"}>
              <div class="card-heading">
                <div>
                  <p class="result-kind">{severityLabel(finding.severity)} · {finding.family}</p>
                  <h3>{finding.summary}</h3>
                </div>
                <span class="severity">{severityLabel(finding.severity)}</span>
              </div>
              <details>
                <summary>Why this appeared</summary>
                <p>{finding.explanation}</p>
                <p class="rule">Rule {finding.ruleId} · version {finding.ruleVersion}</p>
              </details>
              <div class="evidence" aria-label={`Evidence for ${finding.summary}`}>
                {#each finding.evidence as item (`${item.role}:${item.stableId}:${item.path}:${item.sourceRange.start}`)}
                  <button type="button" onclick={() => onOpenSource(item)}>
                    <strong>{item.role}</strong> · {item.title} · {item.property ?? "source"} · {canonLabel(item)} · line {item.sourceRange.line}
                  </button>
                {/each}
              </div>
            </article>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <footer>
    Review is local, memory-only, and awards no daily words. Nothing here edits, dismisses, or repairs a source.
  </footer>
</section>

<style>
  .review-workspace {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    padding: clamp(1rem, 3vw, 2.5rem);
    background: #1e1e1e;
    color: #d4d4d4;
  }

  header,
  .controls,
  .section-heading,
  .card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  header,
  .controls,
  .result-section,
  .limit-notice,
  footer {
    box-sizing: border-box;
    max-width: 76rem;
    margin: 0 auto 1rem;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.35rem;
    color: #fff;
    font-size: 1.7rem;
  }

  h2 {
    margin-bottom: 0;
    color: #f0f0f0;
    font-size: 1.05rem;
  }

  h3 {
    margin-bottom: 0;
    color: #ededed;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  header > div:first-child > p:not(.eyebrow),
  .scope-control > p,
  .empty,
  footer {
    color: #aaa;
    line-height: 1.45;
  }

  header > div:first-child > p:not(.eyebrow) {
    max-width: 45rem;
    margin-bottom: 0;
  }

  .eyebrow,
  .result-kind {
    margin-bottom: 0.2rem;
    color: #a7d7ad;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.5rem;
  }

  button,
  select {
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
  }

  button {
    padding: 0.35rem 0.55rem;
    color: #75beff;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #383838;
  }

  button:focus-visible,
  select:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button.primary {
    border-color: #4d6252;
    background: #29322b;
    color: #c7e5cc;
  }

  .controls,
  .result-section,
  .limit-notice {
    padding: 1rem;
    border: 1px solid #3c3c3c;
    border-radius: 7px;
    background: #242424;
  }

  .controls {
    display: block;
  }

  .scope-control {
    min-width: min(28rem, 100%);
  }

  .scope-control > label,
  legend {
    color: #ededed;
    font-size: 0.78rem;
    font-weight: 700;
  }

  select {
    display: block;
    width: 100%;
    margin-top: 0.35rem;
    padding: 0.45rem 0.55rem;
  }

  .scope-control > p {
    max-width: 42rem;
    margin: 0.45rem 0 0;
    font-size: 0.72rem;
  }

  fieldset {
    margin: 0.9rem 0 0;
    padding: 0.8rem 0 0;
    border: 0;
    border-top: 1px solid #3c3c3c;
  }

  .filter-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 0.4rem;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: #c6c6c6;
    font-size: 0.76rem;
  }

  fieldset label span,
  .section-heading > span,
  .severity {
    padding: 0.1rem 0.36rem;
    border: 1px solid #505050;
    border-radius: 999px;
    color: #bdbdbd;
    font-size: 0.68rem;
  }

  .limit-notice {
    border-color: #765044;
    color: #e1b6a9;
    line-height: 1.45;
  }

  .section-heading {
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .result-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .result-list > li + li {
    margin-top: 0.65rem;
  }

  .result-card {
    padding: 0.8rem;
    border: 1px solid #414141;
    border-left: 3px solid #55745b;
    border-radius: 5px;
    background: #292929;
  }

  .result-card.review {
    border-left-color: #a2834d;
  }

  .result-card.contradiction,
  .result-card.source-problem {
    border-left-color: #a65f50;
  }

  .result-card.review .result-kind {
    color: #d5b77c;
  }

  .result-card.contradiction .result-kind,
  .result-card.source-problem .result-kind {
    color: #e0a092;
  }

  details {
    margin-top: 0.65rem;
    color: #b9b9b9;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  summary {
    width: fit-content;
    color: #75beff;
    cursor: pointer;
  }

  details p {
    margin: 0.45rem 0 0;
  }

  .rule {
    color: #929292;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-wrap: anywhere;
  }

  .evidence {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.7rem;
  }

  .evidence button {
    width: 100%;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .empty p:last-child,
  footer {
    margin-bottom: 0;
  }

  footer {
    font-size: 0.72rem;
  }

  @media (max-width: 760px) {
    header,
    .card-heading {
      flex-direction: column;
    }

    .workspace-actions,
    .workspace-actions button {
      width: 100%;
    }
  }
</style>
