<script lang="ts">
  import { onMount } from "svelte";
  import type {
    ManuscriptCreationMode,
    ManuscriptCreationPlan,
  } from "./creation";
  import type { ManuscriptOutlineItem } from "./structure";

  interface Props {
    title: string;
    mode: ManuscriptCreationMode;
    importDirectory: string;
    plan: ManuscriptCreationPlan | null;
    planning: boolean;
    busy: boolean;
    executionError: string;
    onTitle: (title: string) => void;
    onMode: (mode: ManuscriptCreationMode) => void;
    onRefresh: () => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    title,
    mode,
    importDirectory,
    plan,
    planning,
    busy,
    executionError,
    onTitle,
    onMode,
    onRefresh,
    onCancel,
    onConfirm,
  }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let titleInput = $state<HTMLInputElement>();

  const itemCount = $derived.by(() => {
    if (plan?.kind !== "ready") return 0;
    return plan.structure.manuscripts[0]?.items.reduce(
      (count, item) => count + (item.kind === "chapter" ? 1 + item.children.length : 1),
      0,
    ) ?? 0;
  });

  onMount(() => {
    titleInput?.focus();
    titleInput?.select();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current - 1 + focusable.length) % focusable.length
      : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

{#snippet sourcePath(path: string, label?: string)}
  <div class="source">
    {#if label}<span>{label}</span>{/if}
    <code>{path}</code>
  </div>
{/snippet}

{#snippet outlineItem(item: ManuscriptOutlineItem)}
  <li>
    <strong>{item.title}</strong>
    {#if item.kind === "scene"}
      {@render sourcePath(item.source.path)}
    {:else}
      <small>Chapter container · <code>{item.folder ?? "logical only"}</code></small>
      {#if item.overview}
        {@render sourcePath(item.overview.path, "Overview notes")}
      {/if}
      {#if item.children.length > 0}
        <ol>
          {#each item.children as scene (scene.id)}
            {@render outlineItem(scene)}
          {/each}
        </ol>
      {:else}
        <p class="empty">No scene files in this chapter.</p>
      {/if}
    {/if}
  </li>
{/snippet}

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="create-manuscript-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="create-manuscript-heading">Create manuscript structure</h2>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Cancel manuscript structure creation"
        disabled={busy}
        onclick={onCancel}
      >×</button>
    </header>

    <label for="manuscript-title">Manuscript title</label>
    <input
      id="manuscript-title"
      bind:this={titleInput}
      value={title}
      disabled={busy}
      aria-invalid={plan?.kind === "blocked" &&
        plan.issues.some((issue) => issue.path === "manuscripts[0].title")}
      oninput={(event) => onTitle(event.currentTarget.value)}
    />

    <fieldset disabled={busy}>
      <legend>How should this manuscript begin?</legend>
      <label class="mode">
        <input
          type="radio"
          name="manuscript-start"
          value="import"
          checked={mode === "import"}
          onchange={() => onMode("import")}
        />
        <span>
          <strong>Import existing Markdown</strong>
          <small>Read immediate files and chapter folders in <code>{importDirectory || "Project root"}</code>.</small>
        </span>
      </label>
      <label class="mode">
        <input
          type="radio"
          name="manuscript-start"
          value="empty"
          checked={mode === "empty"}
          onchange={() => onMode("empty")}
        />
        <span>
          <strong>Start with an empty outline</strong>
          <small>Create one book record and add its structure later.</small>
        </span>
      </label>
    </fieldset>

    <section class="preview" aria-labelledby="manuscript-preview-heading" aria-live="polite">
      <div class="preview-heading">
        <div>
          <span class="eyebrow">Exact proposed hierarchy</span>
          <h3 id="manuscript-preview-heading">Preview</h3>
        </div>
        <button type="button" disabled={planning || busy} onclick={onRefresh}
          >{planning ? "Reading…" : "Refresh preview"}</button>
      </div>

      {#if planning}
        <p class="muted" role="status">Reading the selected import folder safely…</p>
      {:else if !plan}
        <p class="problem" role="alert">No preview is available yet.</p>
      {:else if plan.kind === "blocked"}
        <div class="problem" role="alert">
          <strong>Nothing can be created from this preview.</strong>
          <ul>
            {#each plan.issues.slice(0, 8) as issue}
              <li><code>{issue.path || "Project root"}</code>: {issue.message}</li>
            {/each}
          </ul>
          {#if plan.issues.length > 8}<p>{plan.issues.length - 8} more issues not shown.</p>{/if}
        </div>
      {:else}
        <div class="summary">
          <strong>{plan.structure.manuscripts[0]?.title}</strong>
          <span>{itemCount} imported {itemCount === 1 ? "outline item" : "outline items"}</span>
        </div>
        {#if plan.structure.manuscripts[0]?.items.length}
          <ol class="outline">
            {#each plan.structure.manuscripts[0].items as item (item.id)}
              {@render outlineItem(item)}
            {/each}
          </ol>
        {:else}
          <p class="empty">The first manuscript will begin with no chapters or scenes.</p>
        {/if}
        {#if plan.skipped.length > 0}
          <details class="skipped">
            <summary>{plan.skipped.length} visible {plan.skipped.length === 1 ? "path was" : "paths were"} not imported</summary>
            <ul>
              {#each plan.skipped.slice(0, 20) as skipped}
                <li><code>{skipped.path}</code>: {skipped.reason}</li>
              {/each}
            </ul>
            {#if plan.skipped.length > 20}<p>{plan.skipped.length - 20} more paths not shown.</p>{/if}
          </details>
        {/if}
      {/if}
    </section>

    <p class="safety">
      Confirmation rechecks the folder and every imported source, then creates only
      <code>200-crappy-words.manuscripts.json</code>. Existing Markdown is not edited,
      moved, renamed, or numbered, and an existing structure is never replaced.
    </p>

    {#if executionError}
      <p class="problem" role="alert">{executionError}</p>
    {/if}

    <footer>
      <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={planning || busy || plan?.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Creating…" : "Create structure"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 45;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: rgb(0 0 0 / 66%);
  }
  .dialog {
    box-sizing: border-box;
    width: min(46rem, 100%);
    max-height: min(48rem, calc(100vh - 2.5rem));
    overflow: auto;
    padding: 1rem;
    border: 1px solid #505050;
    border-radius: 8px;
    box-shadow: 0 18px 54px rgb(0 0 0 / 55%);
    background: #252525;
    color: #d4d4d4;
  }
  header,
  footer,
  .preview-heading,
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  header {
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.08rem;
  }
  h3 {
    font-size: 0.92rem;
  }
  .eyebrow {
    color: #f6c177;
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  label,
  legend {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.76rem;
    font-weight: 600;
  }
  #manuscript-title {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 0.8rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid #555555;
    border-radius: 4px;
    outline: none;
    background: #1e1e1e;
    color: #eeeeee;
    font: inherit;
  }
  input[aria-invalid="true"] {
    border-color: #b7844b;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .mode {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    margin: 0.45rem 0;
    padding: 0.55rem;
    border: 1px solid #444444;
    border-radius: 5px;
    background: #202020;
    cursor: pointer;
  }
  .mode input {
    margin-top: 0.18rem;
  }
  .mode span,
  .summary {
    display: flex;
    flex-direction: column;
    gap: 0.16rem;
  }
  small,
  .muted,
  .empty,
  .safety {
    color: #a8a8a8;
    font-size: 0.73rem;
    line-height: 1.4;
  }
  .preview {
    margin-top: 0.85rem;
    padding: 0.75rem;
    border: 1px solid #444444;
    border-radius: 5px;
    background: #1f1f1f;
  }
  .preview-heading {
    align-items: flex-start;
    margin-bottom: 0.65rem;
  }
  .summary {
    align-items: flex-start;
    padding: 0.55rem;
    border-radius: 4px;
    background: #202a25;
    color: #b9d7c0;
  }
  ol,
  ul {
    margin: 0.45rem 0 0;
    padding-left: 1.25rem;
  }
  li {
    margin: 0.42rem 0;
    line-height: 1.35;
  }
  li > ol {
    margin-top: 0.3rem;
  }
  .source {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    margin-top: 0.12rem;
    color: #969696;
    font-size: 0.7rem;
  }
  code {
    color: #dcd7ba;
    overflow-wrap: anywhere;
  }
  .skipped {
    margin-top: 0.6rem;
    border-top: 1px solid #3d3d3d;
  }
  .skipped summary {
    padding-top: 0.55rem;
    color: #bdbdbd;
    cursor: pointer;
    font-size: 0.73rem;
  }
  .problem {
    margin-top: 0.65rem;
    padding: 0.6rem;
    border: 1px solid #765a39;
    border-radius: 4px;
    background: #352c22;
    color: #f6c177;
    font-size: 0.74rem;
    line-height: 1.4;
  }
  .safety {
    margin-top: 0.8rem;
  }
  footer {
    justify-content: flex-end;
    margin-top: 1rem;
  }
  button {
    padding: 0.45rem 0.7rem;
    border: 1px solid #555555;
    border-radius: 4px;
    background: #303030;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: #3a3a3a;
  }
  button.primary {
    border-color: #4f7f60;
    background: #365c43;
  }
  button.close {
    padding: 0.1rem 0.35rem;
    border: 0;
    background: transparent;
    font-size: 1.2rem;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  input:focus-visible,
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }
</style>
