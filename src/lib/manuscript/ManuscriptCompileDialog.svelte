<script lang="ts">
  import type {
    ManuscriptCompileFormat,
    ManuscriptCompilePlan,
  } from "./compile";

  interface Props {
    plan: ManuscriptCompilePlan | null;
    format: ManuscriptCompileFormat;
    busy: boolean;
    error: string;
    completedPath: string;
    onFormat: (format: ManuscriptCompileFormat) => void;
    onRefresh: () => void;
    onRepair: (itemId: string) => void;
    onEdit: (itemId: string) => void;
    onCancel: () => void;
    onExport: () => void;
  }

  let {
    plan,
    format,
    busy,
    error,
    completedPath,
    onFormat,
    onRefresh,
    onRepair,
    onEdit,
    onCancel,
    onExport,
  }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let cancelButton = $state<HTMLButtonElement>();
  let initialFocusPending = true;

  $effect(() => {
    if (busy || !initialFocusPending || !cancelButton) return;
    initialFocusPending = false;
    const frame = requestAnimationFrame(() => cancelButton?.focus());
    return () => cancelAnimationFrame(frame);
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    event.stopImmediatePropagation();
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
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

<svelte:window onkeydowncapture={handleKeydown} />

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="compile-heading"
    tabindex="-1"
    bind:this={dialog}
  >
    <span class="eyebrow">Reading copy</span>
    <h2 id="compile-heading">Compile {plan && plan.kind !== "unavailable" ? plan.manuscriptTitle : "manuscript"}</h2>

    {#if completedPath}
      <div class="success" role="status">
        <strong>Export complete</strong>
        <p>{completedPath}</p>
        {#if plan && plan.kind !== "unavailable"}
          <p>{plan.summary.words} words · {plan.summary.chapters} chapters · {plan.summary.scenes} prose sources</p>
        {/if}
        <p>Source files, manuscript structure, and daily progress were not changed.</p>
      </div>
    {:else}
      <fieldset disabled={busy}>
        <legend>Format</legend>
        <label>
          <input
            type="radio"
            name="compile-format"
            checked={format === "markdown"}
            onchange={() => onFormat("markdown")}
          />
          Markdown
        </label>
        <label>
          <input
            type="radio"
            name="compile-format"
            checked={format === "text"}
            onchange={() => onFormat("text")}
          />
          Plain text
        </label>
      </fieldset>

      {#if !plan}
        <p role="status">{busy ? "Checking structure and prose…" : "Compile preview is unavailable."}</p>
      {:else if plan.kind === "unavailable"}
        <p class="problem" role="alert">{plan.reason}</p>
      {:else}
        <div class="summary" aria-label="Compile summary">
          <span>{plan.summary.chapters} chapters</span>
          <span>{plan.summary.scenes} prose sources</span>
          <span>{plan.summary.words} words</span>
          <span>{plan.summary.excludedItems} excluded</span>
        </div>
        <p class="filename">Suggested filename · <code>{plan.suggestedFilename}</code></p>

        {#if plan.blockers.length > 0}
          <section class="blockers" aria-labelledby="compile-blockers">
            <h3 id="compile-blockers">Resolve before export</h3>
            <p>No partial manuscript will be written.</p>
            <ul>
              {#each plan.blockers as blocker (`${blocker.itemId}:${blocker.sourceKind}`)}
                <li>
                  <strong>{blocker.title}</strong>
                  <small>{blocker.sourcePath}</small>
                  <span>{blocker.message}</span>
                  <div class="inline-actions">
                    {#if blocker.sourceKind === "moved"}
                      <button type="button" disabled={busy} onclick={() => onRepair(blocker.itemId)}>Review path repair…</button>
                    {/if}
                    <button type="button" disabled={busy} onclick={() => onEdit(blocker.itemId)}>Edit details…</button>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <section aria-labelledby="compile-order">
          <h3 id="compile-order">Compile order</h3>
          <ol class="order">
            {#each plan.entries as entry (entry.itemId)}
              <li class:excluded={!entry.included}>
                <span>{entry.kind === "chapter" ? "Chapter" : "Scene"} · {entry.title}</span>
                {#if !entry.included}<small>Excluded</small>{/if}
              </li>
            {/each}
          </ol>
        </section>
        <p class="boundary">Scene titles and planning metadata stay out of the reading copy. Sources and structure are rechecked after Save As and before the create-new write.</p>
      {/if}
    {/if}

    {#if error}<p class="problem" role="alert">{error}</p>{/if}

    <footer>
      <button type="button" bind:this={cancelButton} disabled={busy} onclick={onCancel}>
        {completedPath ? "Close" : "Cancel"}
      </button>
      {#if !completedPath}
        <button type="button" disabled={busy} onclick={onRefresh}>Check again</button>
        <button
          type="button"
          class="primary"
          disabled={busy || plan?.kind !== "ready"}
          onclick={onExport}
        >{busy ? "Checking…" : "Save As…"}</button>
      {/if}
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
    width: min(42rem, 100%);
    max-height: min(46rem, calc(100vh - 2.5rem));
    overflow: auto;
    padding: 1rem;
    border: 1px solid #4b4b4b;
    border-radius: 8px;
    box-shadow: 0 18px 54px rgb(0 0 0 / 55%);
    background: #252525;
    color: #d4d4d4;
  }
  .eyebrow { color: #75beff; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  h2 { margin: 0.25rem 0 0.9rem; color: #fff; font-size: 1.08rem; }
  h3 { margin: 0.85rem 0 0.35rem; color: #e6e6e6; font-size: 0.86rem; }
  p { margin: 0.45rem 0; line-height: 1.42; }
  fieldset { display: flex; gap: 1rem; margin: 0 0 0.75rem; border: 1px solid #444; }
  legend { padding: 0 0.3rem; color: #b8b8b8; }
  label { display: flex; gap: 0.35rem; align-items: center; }
  .summary { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .summary span { padding: 0.2rem 0.4rem; border-radius: 999px; background: #333; color: #c8e6c9; font-size: 0.72rem; }
  .filename, .boundary, .blockers p { color: #a9a9a9; font-size: 0.76rem; }
  code { color: #d7ba7d; }
  ul, ol { margin: 0.4rem 0; padding-left: 1.4rem; }
  .blockers li { margin: 0.65rem 0; }
  .blockers li > small, .blockers li > span { display: block; margin-top: 0.15rem; overflow-wrap: anywhere; }
  .blockers li > small { color: #ce9178; }
  .order { max-height: 15rem; overflow: auto; }
  .order li { margin: 0.25rem 0; }
  .order li.excluded { color: #999; }
  .order small { margin-left: 0.45rem; color: #f6c177; }
  .inline-actions { display: flex; gap: 0.4rem; margin-top: 0.35rem; }
  .problem { color: #f48771; overflow-wrap: anywhere; }
  .success { padding: 0.75rem; border: 1px solid #477a52; border-radius: 6px; background: #203b28; }
  footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  button { padding: 0.42rem 0.65rem; border: 1px solid #4b4b4b; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button.primary { border-color: #0e639c; background: #0e639c; color: white; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary:hover:not(:disabled) { background: #1177bb; }
  button:focus-visible, input:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  button:disabled { opacity: 0.55; cursor: default; }
</style>
