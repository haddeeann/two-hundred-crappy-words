<script lang="ts">
  import ContinuityAuthoring from "$lib/lore/ContinuityAuthoring.svelte";
  import type { ContinuityAuthoringContext } from "$lib/lore/continuity-authoring";
  import type {
    ContinuityMutationPlan,
    ContinuityMutationRequest,
  } from "$lib/lore/continuity-mutation";
  import type {
    RelationshipAuthoringRequest,
    RelationshipInspectorPresentation,
    RelationshipPresentationSection,
    RelationshipPresentationSource,
  } from "./presentation";

  interface Props {
    presentation: RelationshipInspectorPresentation;
    authoring: ContinuityAuthoringContext;
    authoringBusy: boolean;
    authoringNotice: string;
    authoringUndoLabel: string;
    authoringRequest: RelationshipAuthoringRequest | null;
    onOpenReference: (path: string) => void;
    onOpenSource: (source: RelationshipPresentationSource) => void;
    onEditRelationship: (
      factId: string,
      source: RelationshipPresentationSource,
    ) => void;
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
    authoringRequest,
    onOpenReference,
    onOpenSource,
    onEditRelationship,
    onConfirmAuthoring,
    onUndoAuthoring,
  }: Props = $props();
</script>

{#snippet sections(values: readonly RelationshipPresentationSection[])}
  {#each values as section (section.key)}
    <section class="relationship-group">
      <h3>{section.title}</h3>
      <ul>
        {#each section.items as item (item.key)}
          <li>
            <div class="relationship-heading">
              <strong>{item.otherTitle}</strong>
              <span>{item.otherType}</span>
            </div>
            <p class="direction">{item.direction}</p>
            <dl>
              <div><dt>Canon</dt><dd>{item.canon}</dd></div>
              <div><dt>Certainty</dt><dd>{item.certainty}</dd></div>
              {#if item.validity}
                <div><dt>Valid</dt><dd>{item.validity}</dd></div>
              {/if}
            </dl>
            {#if item.note}<p class="relationship-note">{item.note}</p>{/if}
            <div class="actions">
              <button
                type="button"
                onclick={() => onOpenReference(item.referencePath)}
              >Open {item.otherTitle} as reference</button>
              <button
                type="button"
                class="source"
                onclick={() => onOpenSource(item.source)}
              >{item.source.label}</button>
              <button
                type="button"
                onclick={() => onEditRelationship(item.factId, item.source)}
              >Edit relationship at its source</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/snippet}

<details class="relationship-inspector">
  <summary>{presentation.summary}</summary>
  {#if presentation.kind === "no-active-note"}
    <p class="empty">
      Open a character, faction, spacecraft, technology, or location note to
      inspect its typed relationships.
    </p>
  {:else if presentation.kind === "updating"}
    <p class="empty" role="status">
      Waiting for the in-memory index to catch up. No stale relationship source
      actions are shown.
    </p>
  {:else if presentation.kind === "unavailable"}
    <p class="empty review" role="status">{presentation.reason}</p>
  {:else}
    <header>
      <div>
        <strong>{presentation.title}</strong>
        <small>{presentation.path} · {presentation.noteType}</small>
      </div>
      <span>Source linked</span>
    </header>

    {#if presentation.builtInSections.length === 0}
      <p class="empty">No built-in relationship facts connect this note yet.</p>
    {:else}
      {@render sections(presentation.builtInSections)}
    {/if}

    {#if presentation.customSections.length > 0}
      <details class="custom-links">
        <summary>
          Other typed links · {presentation.customSections.reduce(
            (count, section) => count + section.items.length,
            0,
          )}
        </summary>
        <p class="custom-explanation">
          Writer-defined links keep their literal source direction. The app does
          not guess symmetry, an inverse, or social meaning.
        </p>
        {@render sections(presentation.customSections)}
      </details>
    {/if}

    {#if presentation.omittedAssertionCount > 0}
      <p class="limit-note">
        {presentation.omittedAssertionCount} additional
        {presentation.omittedAssertionCount === 1 ? " relationship is" : " relationships are"}
        omitted by the 100-relationship view limit.
      </p>
    {/if}

    {#if presentation.issues.length > 0}
      <section class="issues" aria-labelledby="relationship-review-heading">
        <h3 id="relationship-review-heading">Relationship review</h3>
        <ul>
          {#each presentation.issues as issue (issue.key)}
            <li>
              <p>{issue.message}</p>
              <button
                type="button"
                class="source"
                onclick={() => onOpenSource(issue.source)}
              >{issue.source.label}</button>
              <button
                type="button"
                onclick={() => onEditRelationship(issue.factId, issue.source)}
              >Edit source fact</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if presentation.sourceDiagnostics.length > 0}
      <section class="issues" aria-labelledby="relationship-metadata-heading">
        <h3 id="relationship-metadata-heading">Structured metadata issues</h3>
        <ul>
          {#each presentation.sourceDiagnostics as issue (issue.key)}
            <li>
              <p>{issue.message}</p>
              <button
                type="button"
                class="source"
                onclick={() => onOpenSource(issue.source)}
              >{issue.source.label}</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if presentation.omittedIssueCount + presentation.omittedSourceDiagnosticCount > 0}
      <p class="limit-note">
        {presentation.omittedIssueCount + presentation.omittedSourceDiagnosticCount}
        additional review
        {presentation.omittedIssueCount + presentation.omittedSourceDiagnosticCount === 1
          ? " item is"
          : " items are"}
        omitted by the review limit.
      </p>
    {/if}

    <ContinuityAuthoring
      context={authoring}
      busy={authoringBusy}
      notice={authoringNotice}
      undoLabel={authoringUndoLabel}
      scope="relationships"
      requestedFactId={authoringRequest?.factId ?? null}
      requestedSourcePath={authoringRequest?.sourcePath ?? null}
      requestRevision={authoringRequest?.revision ?? 0}
      idPrefix="relationship"
      onConfirm={onConfirmAuthoring}
      onUndo={onUndoAuthoring}
    />

    <p class="privacy">
      Derived locally from this project. Relationships are never added,
      reciprocated, or rewritten automatically.
    </p>
  {/if}
</details>

<style>
  .relationship-inspector {
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
  .relationship-heading,
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

  header strong,
  header small {
    display: block;
    overflow-wrap: anywhere;
  }

  header small,
  .empty,
  .privacy,
  .direction,
  .custom-explanation,
  .limit-note {
    color: #929292;
  }

  header > span,
  .relationship-heading > span {
    flex: 0 0 auto;
    padding: 0.1rem 0.3rem;
    border: 1px solid #4b5e50;
    border-radius: 999px;
    color: #a7d7ad;
    font-size: 0.65rem;
  }

  .relationship-group,
  .issues {
    padding-top: 0.5rem;
    border-top: 1px solid #3c3c3c;
  }

  h3,
  p {
    margin: 0 0 0.35rem;
  }

  h3 {
    color: #d8d8d8;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relationship-group li,
  .issues li {
    padding: 0.45rem 0;
  }

  .relationship-group li + li,
  .issues li + li {
    border-top: 1px solid #333;
  }

  .relationship-heading strong {
    color: #e1e1e1;
    overflow-wrap: anywhere;
  }

  .direction,
  .custom-explanation,
  .limit-note,
  .privacy,
  .empty {
    line-height: 1.4;
  }

  dl {
    margin: 0.4rem 0 0;
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

  .relationship-note {
    margin-top: 0.4rem;
    padding-left: 0.5rem;
    border-left: 2px solid #4a4a4a;
    line-height: 1.4;
  }

  .actions {
    display: grid;
    gap: 0.18rem;
    margin-top: 0.35rem;
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

  button.source {
    color: #929292;
    font-size: 0.68rem;
  }

  .custom-links {
    margin-top: 0.45rem;
    padding-top: 0.15rem;
    border-top: 1px solid #3c3c3c;
  }

  .custom-links > summary {
    color: #ddc98e;
    font-size: 0.72rem;
  }

  .issues p,
  .review {
    color: #ddc98e;
  }

  .limit-note,
  .privacy,
  .empty,
  .custom-explanation {
    margin: 0.4rem 0;
  }
</style>
