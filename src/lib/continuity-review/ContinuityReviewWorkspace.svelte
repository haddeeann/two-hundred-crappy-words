<script lang="ts">
  import type {
    IntentionalContinuityFinding,
    StaleContinuityException,
  } from "./exceptions";
  import type { ContinuityException } from "./format";
  import type { ContinuityReviewProjectLoadResult } from "./load";
  import type {
    ContinuityReviewEvidence,
    ContinuityReviewFinding,
    ContinuityReviewModel,
  } from "./types";

  export interface ContinuityReviewManuscriptOption {
    id: string;
    title: string;
  }

  interface Props {
    model: ContinuityReviewModel;
    exceptionResult: ContinuityReviewProjectLoadResult;
    intentionalFindings: readonly IntentionalContinuityFinding[];
    staleExceptions: readonly StaleContinuityException[];
    manuscripts: readonly ContinuityReviewManuscriptOption[];
    loading: boolean;
    mutationBusy: boolean;
    undoLabel: string | null;
    onClose: () => void;
    onRefresh: () => void;
    onUndo: () => void;
    onSelectScope: (manuscriptId: string | null) => void;
    onOpenSource: (evidence: ContinuityReviewEvidence) => void;
    onMarkIntentional: (finding: ContinuityReviewFinding) => void;
    onEditException: (exception: ContinuityException) => void;
    onRemoveException: (exception: ContinuityException) => void;
  }

  let {
    model,
    exceptionResult,
    intentionalFindings,
    staleExceptions,
    manuscripts,
    loading,
    mutationBusy,
    undoLabel,
    onClose,
    onRefresh,
    onUndo,
    onSelectScope,
    onOpenSource,
    onMarkIntentional,
    onEditException,
    onRemoveException,
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
  const exceptionMessage = $derived(exceptionProjectMessage(exceptionResult));

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

  function exceptionProjectMessage(value: ContinuityReviewProjectLoadResult): string {
    if (value.kind === "ready") {
      const count = value.continuityReviewProject.exceptions.length;
      return `${count} portable intentional ${count === 1 ? "exception is" : "exceptions are"} loaded from the project file.`;
    }
    if (value.kind === "absent") {
      return "No portable intentional-exception file exists for this world. Every current finding remains active, and nothing was created.";
    }
    if (value.kind === "invalid") {
      return `The intentional-exception file is invalid: ${value.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")} Its exceptions are disabled, and the file was not changed.`;
    }
    if (value.kind === "malformed") {
      return `The intentional-exception file is not valid JSON: ${value.message} Its exceptions are disabled, and the file was not changed.`;
    }
    if (value.kind === "unsupported-version") {
      return `The intentional-exception file uses newer version ${value.version}. Its exceptions are disabled, and the file was preserved untouched.`;
    }
    return value.message;
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
      {#if undoLabel}
        <button type="button" onclick={onUndo} disabled={loading || mutationBusy}>{undoLabel}</button>
      {/if}
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

  <p
    class="exception-status"
    class:problem={exceptionResult.kind !== "ready" && exceptionResult.kind !== "absent"}
    role={exceptionResult.kind !== "ready" && exceptionResult.kind !== "absent" ? "alert" : "status"}
  >
    {exceptionMessage}
  </p>

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
                <div class="card-actions">
                  <span class="severity">{severityLabel(finding.severity)}</span>
                  {#if finding.severity === "review" || finding.severity === "contradiction"}
                    <button
                      type="button"
                      onclick={() => onMarkIntentional(finding)}
                      disabled={mutationBusy || (exceptionResult.kind !== "ready" && exceptionResult.kind !== "absent")}
                    >Mark intentional…</button>
                  {/if}
                </div>
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

  {#if intentionalFindings.length > 0}
    <details class="result-section intentional-section">
      <summary>
        <span>
          <span class="eyebrow">Writer-approved, still visible</span>
          <strong>Intentional findings</strong>
        </span>
        <span class="section-count">{intentionalFindings.length}</span>
      </summary>
      <p class="section-intro">These exact Review or Contradiction findings still exist. Their portable explanations do not change or prove the underlying sources.</p>
      <ol class="result-list">
        {#each intentionalFindings as intentional (intentional.exception.id)}
          <li>
            <article class="result-card intentional">
              <div class="card-heading">
                <div>
                  <p class="result-kind">Intentional {severityLabel(intentional.finding.severity)} · {intentional.finding.family}</p>
                  <h3>{intentional.finding.summary}</h3>
                </div>
                <div class="card-actions">
                  <span class="severity">Intentional</span>
                  <button type="button" onclick={() => onEditException(intentional.exception)} disabled={mutationBusy}>Edit explanation…</button>
                  <button type="button" class="danger-text" onclick={() => onRemoveException(intentional.exception)} disabled={mutationBusy}>Remove…</button>
                </div>
              </div>
              <div class="writer-explanation">
                <strong>Writer explanation</strong>
                <p>{intentional.exception.explanation}</p>
              </div>
              <details>
                <summary>Why the finding still appears</summary>
                <p>{intentional.finding.explanation}</p>
                <p class="rule">Rule {intentional.finding.ruleId} · version {intentional.finding.ruleVersion}</p>
              </details>
              <div class="evidence" aria-label={`Evidence for intentional finding ${intentional.finding.summary}`}>
                {#each intentional.finding.evidence as item (`${item.role}:${item.stableId}:${item.path}:${item.sourceRange.start}`)}
                  <button type="button" onclick={() => onOpenSource(item)}>
                    <strong>{item.role}</strong> · {item.title} · {item.property ?? "source"} · {canonLabel(item)} · line {item.sourceRange.line}
                  </button>
                {/each}
              </div>
            </article>
          </li>
        {/each}
      </ol>
    </details>
  {/if}

  {#if staleExceptions.length > 0}
    <section class="result-section stale-section" aria-labelledby="stale-exceptions-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Needs a writer decision</p>
          <h2 id="stale-exceptions-heading">Stale intentional exceptions</h2>
        </div>
        <span>{staleExceptions.length}</span>
      </div>
      <p class="section-intro">These are shown project-wide because missing or changed evidence cannot always be assigned safely to the selected manuscript. Nothing was retargeted or removed.</p>
      <ol class="result-list">
        {#each staleExceptions as stale (stale.exception.id)}
          <li>
            <article class="result-card stale">
              <p class="result-kind">Stale exception · {stale.reason.replaceAll("-", " ")}</p>
              <h3>{stale.exception.ruleId} · version {stale.exception.ruleVersion}</h3>
              <p>{stale.explanation}</p>
              <div class="writer-explanation">
                <strong>Saved writer explanation</strong>
                <p>{stale.exception.explanation}</p>
              </div>
              <div class="card-actions stale-actions">
                <button type="button" onclick={() => onEditException(stale.exception)} disabled={mutationBusy}>Edit explanation…</button>
                <button type="button" class="danger-text" onclick={() => onRemoveException(stale.exception)} disabled={mutationBusy}>Remove…</button>
              </div>
              <details>
                <summary>Saved evidence identities</summary>
                <ul class="identity-list">
                  {#each stale.exception.evidenceIds as evidenceId (evidenceId)}
                    <li><code>{evidenceId}</code></li>
                  {/each}
                </ul>
              </details>
            </article>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <footer>
    Review and intentional-exception changes stay local and award no daily words. Exception changes never edit the underlying story sources.
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
  .exception-status,
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

  .card-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .card-actions button {
    font-size: 0.72rem;
  }

  .card-actions .danger-text {
    color: #efaaa0;
  }

  .stale-actions {
    justify-content: flex-start;
    margin-top: 0.65rem;
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
  .limit-notice,
  .exception-status {
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

  .exception-status {
    color: #b8c7ba;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .exception-status.problem {
    border-color: #765044;
    color: #e1b6a9;
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
  .result-card.source-problem,
  .result-card.stale {
    border-left-color: #a65f50;
  }

  .result-card.intentional {
    border-left-color: #7a6ca6;
  }

  .result-card.review .result-kind {
    color: #d5b77c;
  }

  .result-card.contradiction .result-kind,
  .result-card.source-problem .result-kind,
  .result-card.stale .result-kind {
    color: #e0a092;
  }

  .result-card.intentional .result-kind {
    color: #b9a8e8;
  }

  .intentional-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: auto;
    margin: -1rem;
    padding: 1rem;
    color: #f0f0f0;
  }

  .intentional-section[open] > summary {
    margin-bottom: 0;
  }

  .intentional-section > summary strong {
    display: block;
    font-size: 1.05rem;
  }

  .section-count {
    padding: 0.1rem 0.36rem;
    border: 1px solid #505050;
    border-radius: 999px;
    color: #bdbdbd;
    font-size: 0.68rem;
  }

  .section-intro {
    color: #aaa;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .intentional-section .section-intro {
    margin-top: 1rem;
  }

  .writer-explanation {
    margin-top: 0.7rem;
    padding: 0.65rem;
    border: 1px solid #4c465a;
    border-radius: 4px;
    background: #26232c;
    color: #d1c8e4;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .writer-explanation p {
    margin: 0.3rem 0 0;
    white-space: pre-wrap;
  }

  .result-card.stale > p:not(.result-kind) {
    margin: 0.6rem 0 0;
    color: #c7b2ac;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .identity-list {
    margin: 0.45rem 0 0;
    padding-left: 1.2rem;
  }

  .identity-list code {
    overflow-wrap: anywhere;
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
