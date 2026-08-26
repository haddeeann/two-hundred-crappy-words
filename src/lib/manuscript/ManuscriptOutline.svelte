<script lang="ts">
  import { tick } from "svelte";
  import type { ManuscriptReorderDirection } from "./reorder";
  import type {
    ManuscriptProjectLoadResult,
    ManuscriptSourceState,
    ReconciledManuscriptChapter,
    ReconciledManuscriptItem,
    ReconciledManuscriptScene,
  } from "./source-reconciliation";
  import type { ManuscriptOutlineMetadata } from "./structure";

  interface Props {
    result: Exclude<ManuscriptProjectLoadResult, { kind: "absent" }>;
    loading: boolean;
    repairBusy: boolean;
    repairNotice: string;
    repairUndoLabel: string;
    focusItemId: string;
    focusRevision: number;
    onRefresh: () => void;
    onOpenSource: (path: string, fingerprint: string) => void;
    onRepairSource: (key: string) => void;
    onEditMetadata: (itemId: string) => void;
    onReorder: (itemId: string, direction: ManuscriptReorderDirection) => void;
    onUndoRepair: () => void;
  }

  let {
    result,
    loading,
    repairBusy,
    repairNotice,
    repairUndoLabel,
    focusItemId,
    focusRevision,
    onRefresh,
    onOpenSource,
    onRepairSource,
    onEditMetadata,
    onReorder,
    onUndoRepair,
  }: Props = $props();

  $effect(() => {
    const itemId = focusItemId;
    const revision = focusRevision;
    if (!itemId || revision < 1) return;
    void tick().then(() => {
      document.getElementById(`manuscript-item-${itemId}`)?.focus();
    });
  });

  const summary = $derived.by(() => {
    if (result.kind !== "ready") return "Manuscript structure: needs attention";
    const books = result.reconciled.manuscripts.length;
    const scenes = result.reconciled.manuscripts.reduce(
      (total, manuscript) =>
        total + manuscript.items.reduce((count, item) => count + sceneCount(item), 0),
      0,
    );
    return `Manuscript outline: ${books} ${books === 1 ? "book" : "books"} · ${scenes} ${scenes === 1 ? "scene" : "scenes"}`;
  });

  function sceneCount(item: ReconciledManuscriptItem): number {
    return "children" in item ? item.children.length : 1;
  }

  function sourceLabel(state: ManuscriptSourceState): string {
    if (state.kind === "ready") return state.resolvedPath;
    if (state.kind === "moved") {
      return `Moved candidate: ${state.suggestedPath} · structure not changed`;
    }
    if (state.kind === "ambiguous-id") {
      return `Ambiguous stable ID: ${state.candidatePaths.join(", ")}`;
    }
    if (state.kind === "identity-mismatch") {
      return `Identity changed at ${state.resolvedPath}`;
    }
    if (state.kind === "path-conflict") {
      return `Source conflict at ${state.resolvedPath}`;
    }
    return state.message;
  }

  function activateRepair(event: KeyboardEvent, key: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onRepairSource(key);
  }
</script>

{#snippet sourceRow(
  label: string,
  state: ManuscriptSourceState,
  className = "",
  repairKey = "",
)}
  <div class={`source-row ${className}`}>
    {#if state.kind === "ready"}
      <button
        type="button"
        class="source-open"
        onclick={() => onOpenSource(state.resolvedPath, state.fingerprint)}
        title={`Open ${state.resolvedPath}`}
      >{label}</button>
      <small>{state.resolvedPath}</small>
    {:else}
      <span>{label}</span>
      <small class:source-warning={state.kind !== "moved"}>{sourceLabel(state)}</small>
      {#if state.kind === "moved" && !state.declaredPathOccupied && state.noteId && repairKey}
        <button
          type="button"
          class="repair"
          disabled={repairBusy}
          onclick={() => onRepairSource(repairKey)}
          onkeydown={(event) => activateRepair(event, repairKey)}
        >Review path repair…</button>
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet metadataRows(item: ManuscriptOutlineMetadata)}
  {#if item.synopsis}<small class="synopsis">{item.synopsis}</small>{/if}
  {#if item.status || item.pov || item.location || item.storyDate || item.targetWords || item.labels?.length}
    <div class="metadata" aria-label="Outline details">
      {#if item.status}<span>Status · {item.status}</span>{/if}
      {#if item.pov}<span>POV · {item.pov}</span>{/if}
      {#if item.location}<span>Location · {item.location}</span>{/if}
      {#if item.storyDate}<span>Date · {item.storyDate}</span>{/if}
      {#if item.targetWords}<span>Target · {item.targetWords.toLocaleString()} words</span>{/if}
      {#each item.labels ?? [] as label (label)}<span>#{label}</span>{/each}
    </div>
  {/if}
  {#if item.notes}<small class="planning-notes">Notes · {item.notes}</small>{/if}
{/snippet}

{#snippet reorderControls(
  itemId: string,
  itemTitle: string,
  canMoveEarlier: boolean,
  canMoveLater: boolean,
)}
  {#if canMoveEarlier || canMoveLater}
    <div class="reorder-actions" aria-label={`Reorder ${itemTitle}`}>
      {#if canMoveEarlier}
        <button
          type="button"
          disabled={repairBusy}
          aria-label={`Move ${itemTitle} earlier`}
          title={`Move ${itemTitle} earlier`}
          onclick={() => onReorder(itemId, "earlier")}
        >↑ Earlier</button>
      {/if}
      {#if canMoveLater}
        <button
          type="button"
          disabled={repairBusy}
          aria-label={`Move ${itemTitle} later`}
          title={`Move ${itemTitle} later`}
          onclick={() => onReorder(itemId, "later")}
        >↓ Later</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet sceneRow(
  scene: ReconciledManuscriptScene,
  canMoveEarlier: boolean,
  canMoveLater: boolean,
)}
  <li class="scene-row" id={`manuscript-item-${scene.item.id}`} tabindex="-1">
    {@render sourceRow(scene.item.title, scene.source, "scene-source", `${scene.item.id}:source`)}
    {@render metadataRows(scene.item)}
    {#if !scene.item.includeInCompile}<small>Excluded from compile</small>{/if}
    <button
      type="button"
      class="details"
      disabled={repairBusy}
      onclick={() => onEditMetadata(scene.item.id)}
    >Edit details…</button>
    {@render reorderControls(scene.item.id, scene.item.title, canMoveEarlier, canMoveLater)}
  </li>
{/snippet}

{#snippet chapterRow(
  chapter: ReconciledManuscriptChapter,
  canMoveEarlier: boolean,
  canMoveLater: boolean,
)}
  <li class="chapter-row" id={`manuscript-item-${chapter.item.id}`} tabindex="-1">
    <div class="chapter-heading">
      <strong>{chapter.item.title}</strong>
      {@render metadataRows(chapter.item)}
      <button
        type="button"
        class="details"
        disabled={repairBusy}
        onclick={() => onEditMetadata(chapter.item.id)}
      >Edit details…</button>
      {@render reorderControls(chapter.item.id, chapter.item.title, canMoveEarlier, canMoveLater)}
    </div>
    {#if chapter.folder && chapter.folder.kind !== "ready"}
      <small class="source-warning">{chapter.folder.message}</small>
    {/if}
    {#if chapter.overview}
      {@render sourceRow("Chapter overview", chapter.overview, "overview-source", `${chapter.item.id}:overview`)}
    {/if}
    {#if chapter.source}
      {@render sourceRow("Chapter prose", chapter.source, "chapter-source", `${chapter.item.id}:source`)}
    {/if}
    {#if chapter.children.length > 0}
      <ol class="scene-list">
        {#each chapter.children as scene, childIndex (scene.item.id)}
          {@render sceneRow(scene, childIndex > 0, childIndex < chapter.children.length - 1)}
        {/each}
      </ol>
    {/if}
  </li>
{/snippet}

<details class="manuscript-outline">
  <summary>{summary}</summary>
  {#if result.kind === "ready"}
    <p class="boundary">
      Order and planning come from the visible structure file. Scene prose stays
      in Markdown. Any suggested path repair requires a separate preview.
    </p>
    {#if repairNotice}
      <div class="repair-status" role="status" aria-live="polite">
        <span>{repairNotice}</span>
        {#if repairUndoLabel}
          <button type="button" disabled={repairBusy} onclick={onUndoRepair}
            >{repairBusy ? "Checking…" : repairUndoLabel}</button>
        {/if}
      </div>
    {/if}
    {#each result.reconciled.manuscripts as entry (entry.manuscript.id)}
      <section aria-labelledby={`manuscript-${entry.manuscript.id}`}>
        <h2 id={`manuscript-${entry.manuscript.id}`}>{entry.manuscript.title}</h2>
        {#if entry.items.length === 0}
          <p>No chapters or loose scenes yet.</p>
        {:else}
          <ol class="outline-list">
            {#each entry.items as item, itemIndex (item.item.id)}
              {#if "children" in item}
                {@render chapterRow(item, itemIndex > 0, itemIndex < entry.items.length - 1)}
              {:else}
                {@render sceneRow(item, itemIndex > 0, itemIndex < entry.items.length - 1)}
              {/if}
            {/each}
          </ol>
        {/if}
      </section>
    {/each}
  {:else if result.kind === "invalid"}
    <p class="source-warning" role="status">The structure is invalid and was not used.</p>
    <ul>
      {#each result.issues.slice(0, 5) as issue}
        <li><code>{issue.path}</code>: {issue.message}</li>
      {/each}
    </ul>
    {#if result.issues.length > 5}<p>{result.issues.length - 5} more issues not shown.</p>{/if}
  {:else if result.kind === "malformed"}
    <p class="source-warning" role="status">The structure JSON could not be parsed: {result.message}</p>
  {:else if result.kind === "unsupported-version"}
    <p class="source-warning" role="status">This structure uses newer format version {result.version}; it was not changed.</p>
  {:else}
    <p class="source-warning" role="status">{result.message}</p>
  {/if}
  <button type="button" class="refresh" onclick={onRefresh} disabled={loading}
    >{loading ? "Refreshing…" : "Refresh manuscript outline"}</button>
</details>

<style>
  .manuscript-outline {
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
  .boundary,
  p {
    margin: 0.35rem 0;
    line-height: 1.35;
  }
  section {
    margin-top: 0.6rem;
  }
  h2 {
    margin: 0;
    color: #e0e0e0;
    font-size: 0.82rem;
  }
  ol,
  ul {
    margin: 0.35rem 0;
    padding-left: 1.15rem;
  }
  li {
    margin: 0.32rem 0;
  }
  .chapter-heading,
  .source-row {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.1rem;
  }
  .chapter-heading strong {
    color: #d9d9d9;
  }
  .synopsis,
  .planning-notes {
    margin-top: 0.18rem;
    white-space: pre-wrap;
    line-height: 1.35;
  }
  .synopsis {
    color: #b7b7b7;
  }
  .planning-notes {
    color: #929292;
  }
  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    margin-top: 0.18rem;
  }
  .metadata span {
    padding: 0.1rem 0.28rem;
    border-radius: 999px;
    background: #30363b;
    color: #aebdca;
    font-size: 0.67rem;
  }
  .overview-source {
    margin-top: 0.28rem;
    padding-left: 0.45rem;
    border-left: 2px solid #4d6680;
  }
  .scene-list {
    margin-top: 0.28rem;
  }
  .source-open {
    width: fit-content;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: #9dc8ef;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .repair {
    width: fit-content;
    padding: 0.22rem 0.38rem;
    border: 1px solid #596978;
    border-radius: 4px;
    background: #26323d;
    color: #b8d5ee;
    font: inherit;
    cursor: pointer;
  }
  .details {
    width: fit-content;
    padding: 0;
    border: 0;
    background: transparent;
    color: #aebdca;
    font: inherit;
    text-decoration: underline;
    text-decoration-color: #53616c;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .reorder-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.18rem;
  }
  .reorder-actions button {
    padding: 0.18rem 0.35rem;
    border: 1px solid #4f5962;
    border-radius: 4px;
    background: #292f34;
    color: #b6c9d8;
    font: inherit;
    cursor: pointer;
  }
  .scene-row:focus-visible,
  .chapter-row:focus-visible {
    border-radius: 3px;
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }
  .repair-status {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    margin: 0.45rem 0;
    padding: 0.5rem;
    border: 1px solid #43604c;
    border-radius: 4px;
    background: #202c24;
    color: #bfdbc5;
    line-height: 1.35;
  }
  .repair-status button {
    padding: 0.25rem 0.4rem;
    border: 1px solid #58735e;
    border-radius: 4px;
    background: #2b3d30;
    color: #d0e6d5;
    font: inherit;
    cursor: pointer;
  }
  small {
    overflow-wrap: anywhere;
    color: #909090;
  }
  .source-warning {
    color: #f2b2a8;
  }
  code {
    overflow-wrap: anywhere;
  }
  .refresh {
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.45rem;
    padding: 0.38rem 0.45rem;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }
  .refresh:hover:not(:disabled) {
    background: #333333;
  }
  button:hover:not(:disabled) {
    filter: brightness(1.12);
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
