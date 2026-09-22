<script lang="ts">
  import ContinuityAuthoring from "./ContinuityAuthoring.svelte";
  import type { ContinuityAuthoringContext } from "./continuity-authoring";
  import type {
    ContinuityMutationPlan,
    ContinuityMutationRequest,
  } from "./continuity-mutation";
  import type {
    ContinuityFactPresentation,
    ContinuityInspectorPresentation,
  } from "./continuity-presentation";

  interface Props {
    presentation: ContinuityInspectorPresentation;
    authoring: ContinuityAuthoringContext;
    authoringBusy: boolean;
    authoringNotice: string;
    authoringUndoLabel: string;
    onSelectFact: (fact: ContinuityFactPresentation) => void;
    onOpenReference: (path: string) => void;
    onConfirmAuthoring: (
      plan: ContinuityMutationPlan,
      request: ContinuityMutationRequest,
    ) => Promise<boolean>;
    onUndoAuthoring: () => Promise<void>;
  }

  let {
    presentation,
    authoring,
    authoringBusy,
    authoringNotice,
    authoringUndoLabel,
    onSelectFact,
    onOpenReference,
    onConfirmAuthoring,
    onUndoAuthoring,
  }: Props = $props();

  function openFactReference(fact: ContinuityFactPresentation): void {
    if (fact.reference.kind === "resolved") onOpenReference(fact.reference.path);
  }
</script>

<details class="continuity-inspector">
  <summary>{presentation.summary}</summary>
  {#if presentation.kind === "no-active-note"}
    <p class="empty">Open a Markdown note to inspect its canon and typed facts.</p>
  {:else if presentation.kind === "updating"}
    <p class="empty" role="status">
      Waiting for the in-memory index to catch up with the active draft. No source
      location is exposed while it may be stale.
    </p>
  {:else}
    <header>
      <div>
        <strong>{presentation.title}</strong>
        <small>{presentation.path}{presentation.noteType ? ` · ${presentation.noteType}` : ""}</small>
      </div>
      <span class="source-linked">Source linked</span>
    </header>
    <p class="note-canon">
      Note canon: <strong>{presentation.canon ?? "unspecified"}</strong>
    </p>

    {#if presentation.metadataIssues.length > 0}
      <section class="metadata-issues" aria-labelledby="continuity-metadata-issues">
        <h3 id="continuity-metadata-issues">Structured metadata issues</h3>
        <ul>
          {#each presentation.metadataIssues as issue}
            <li>{issue}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if presentation.facts.length === 0}
      <p class="empty">
        No valid typed facts in this note. Ordinary prose remains fully usable.
      </p>
    {:else}
      <ol class="facts">
        {#each presentation.facts as fact (fact.id)}
          <li>
            <div class="fact-heading">
              <button
                type="button"
                class="property"
                title={`${fact.propertyDescription} Select its exact Markdown source.`}
                onclick={() => onSelectFact(fact)}
              >{fact.propertyLabel}</button>
              <span class:custom={fact.customProperty}>{fact.customProperty ? "custom" : fact.valueKind}</span>
            </div>
            <p class="value">{fact.valueText}</p>
            {#if fact.reference.kind === "resolved"}
              <button
                type="button"
                class="reference"
                onclick={() => openFactReference(fact)}
              >Open {fact.reference.title} as reference</button>
            {/if}
            <dl>
              <div>
                <dt>Canon</dt>
                <dd>{fact.canon ?? "unspecified"}{fact.canonSource === "note" ? " · note default" : fact.canonSource === "fact" ? " · fact override" : ""}</dd>
              </div>
              <div>
                <dt>Certainty</dt>
                <dd>{fact.certainty}</dd>
              </div>
              {#if fact.validity}
                <div>
                  <dt>Valid</dt>
                  <dd>{fact.validity}</dd>
                </div>
              {/if}
            </dl>
            {#if fact.note}<p class="fact-note">{fact.note}</p>{/if}
            {#if fact.diagnostics.length > 0}
              <ul class="diagnostics" aria-label={`Review notes for ${fact.propertyLabel}`}>
                {#each fact.diagnostics as diagnostic}
                  <li>{diagnostic}</li>
                {/each}
              </ul>
            {/if}
            <button
              type="button"
              class="source"
              onclick={() => onSelectFact(fact)}
            >{fact.sourceLabel}</button>
          </li>
        {/each}
      </ol>
    {/if}
    <ContinuityAuthoring
      context={authoring}
      busy={authoringBusy}
      notice={authoringNotice}
      undoLabel={authoringUndoLabel}
      onConfirm={onConfirmAuthoring}
      onUndo={onUndoAuthoring}
    />
    <p class="privacy">
      Derived and edited locally in this project. Nothing is sent anywhere.
    </p>
  {/if}
</details>

<style>
  .continuity-inspector {
    margin: 0 0 0.75rem;
    color: #b8b8b8;
    font-size: 0.76rem;
  }

  summary {
    padding: 0.3rem 0;
    color: #d4d4d4;
    font-weight: 600;
    cursor: pointer;
  }

  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  header,
  .fact-heading,
  dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }

  header {
    padding: 0.55rem 0 0.4rem;
    border-top: 1px solid #3c3c3c;
  }

  header div {
    min-width: 0;
  }

  header strong,
  header small {
    display: block;
    overflow-wrap: anywhere;
  }

  header strong {
    color: #e1e1e1;
  }

  header small {
    margin-top: 0.15rem;
    color: #929292;
  }

  .source-linked,
  .fact-heading span {
    flex: 0 0 auto;
    padding: 0.1rem 0.3rem;
    border: 1px solid #4b5e50;
    border-radius: 999px;
    color: #a7d7ad;
    font-size: 0.65rem;
    line-height: 1.2;
  }

  .fact-heading span.custom {
    border-color: #665d48;
    color: #ddc98e;
  }

  .note-canon,
  .empty,
  .privacy {
    margin: 0.35rem 0;
    line-height: 1.4;
  }

  .facts,
  .metadata-issues ul,
  .diagnostics {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .facts > li {
    padding: 0.65rem 0;
    border-top: 1px solid #3c3c3c;
  }

  button {
    padding: 0;
    border: 0;
    background: none;
    color: #75beff;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button.property {
    color: #e1e1e1;
    font-weight: 700;
  }

  button.reference,
  button.source {
    margin-top: 0.3rem;
  }

  button.source {
    color: #929292;
    font-size: 0.68rem;
  }

  .value {
    margin: 0.35rem 0 0;
    color: #e1e1e1;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  dl {
    margin: 0.45rem 0 0;
  }

  dl div + div {
    margin-top: 0.2rem;
  }

  dt {
    color: #929292;
  }

  dd {
    margin: 0;
    color: #c8c8c8;
    text-align: right;
  }

  .fact-note {
    margin: 0.4rem 0 0;
    padding-left: 0.5rem;
    border-left: 2px solid #4a4a4a;
    color: #b8b8b8;
    line-height: 1.4;
  }

  .diagnostics,
  .metadata-issues ul {
    margin-top: 0.45rem;
    color: #ddc98e;
  }

  .diagnostics li,
  .metadata-issues li {
    margin-top: 0.25rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .diagnostics li::before,
  .metadata-issues li::before {
    content: "Review: ";
    font-weight: 700;
  }

  .metadata-issues {
    margin: 0.5rem 0;
    padding: 0.5rem;
    border: 1px solid #665d48;
    border-radius: 4px;
    background: #302c22;
  }

  .metadata-issues h3 {
    margin: 0;
    color: #ead9a7;
    font-size: 0.74rem;
  }

  .privacy {
    color: #929292;
    font-size: 0.7rem;
  }
</style>
