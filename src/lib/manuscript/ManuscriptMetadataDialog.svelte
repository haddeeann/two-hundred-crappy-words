<script lang="ts">
  import { onMount } from "svelte";
  import type {
    ManuscriptMetadataDraft,
    ManuscriptMetadataEditPlan,
    ManuscriptMetadataTarget,
  } from "./metadata";

  interface Props {
    target: ManuscriptMetadataTarget;
    draft: ManuscriptMetadataDraft;
    plan: ManuscriptMetadataEditPlan;
    busy: boolean;
    executionError: string;
    onDraft: (draft: ManuscriptMetadataDraft) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { target, draft, plan, busy, executionError, onDraft, onCancel, onConfirm }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let titleInput = $state<HTMLInputElement>();

  onMount(() => {
    titleInput?.focus();
    titleInput?.select();
  });

  function update<K extends keyof ManuscriptMetadataDraft>(
    field: K,
    value: ManuscriptMetadataDraft[K],
  ): void {
    onDraft({ ...draft, [field]: value });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="metadata-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="metadata-heading">Edit {target.itemKind} details</h2>
        <small>{target.manuscriptTitle} · {target.itemTitle}</small>
      </div>
      <button type="button" class="close" aria-label="Cancel manuscript details edit" disabled={busy} onclick={onCancel}>×</button>
    </header>

    <div class="form-grid">
      <label class="wide">
        <span>Outline title <b aria-hidden="true">*</b></span>
        <input bind:this={titleInput} value={draft.title} disabled={busy} oninput={(event) => update("title", event.currentTarget.value)} />
      </label>
      <label class="wide">
        <span>Synopsis</span>
        <textarea rows="3" value={draft.synopsis} disabled={busy} oninput={(event) => update("synopsis", event.currentTarget.value)}></textarea>
      </label>
      <label>
        <span>Point of view</span>
        <input value={draft.pov} disabled={busy} oninput={(event) => update("pov", event.currentTarget.value)} />
      </label>
      <label>
        <span>Location</span>
        <input value={draft.location} disabled={busy} oninput={(event) => update("location", event.currentTarget.value)} />
      </label>
      <label>
        <span>Story date</span>
        <input value={draft.storyDate} disabled={busy} oninput={(event) => update("storyDate", event.currentTarget.value)} />
      </label>
      <label>
        <span>Status</span>
        <input value={draft.status} disabled={busy} oninput={(event) => update("status", event.currentTarget.value)} />
      </label>
      <label>
        <span>Word target</span>
        <input inputmode="numeric" value={draft.targetWords} disabled={busy} placeholder="Not set" oninput={(event) => update("targetWords", event.currentTarget.value)} />
      </label>
      <label class="compile">
        <input type="checkbox" checked={draft.includeInCompile} disabled={busy} onchange={(event) => update("includeInCompile", event.currentTarget.checked)} />
        <span>Include in compile</span>
      </label>
      <label class="wide">
        <span>Labels <small>One per line; order is preserved.</small></span>
        <textarea rows="3" value={draft.labels} disabled={busy} oninput={(event) => update("labels", event.currentTarget.value)}></textarea>
      </label>
      <label class="wide">
        <span>Notes</span>
        <textarea rows="4" value={draft.notes} disabled={busy} oninput={(event) => update("notes", event.currentTarget.value)}></textarea>
      </label>
    </div>

    <section class="preview" aria-labelledby="metadata-preview-heading" aria-live="polite">
      <span class="eyebrow">Exact structure changes</span>
      <h3 id="metadata-preview-heading">Preview</h3>
      {#if plan.kind === "blocked"}
        <div class="problem" role="alert">
          <strong>These details are not valid yet.</strong>
          <ul>
            {#each plan.issues.slice(0, 8) as issue}
              <li><code>{issue.path}</code>: {issue.message}</li>
            {/each}
          </ul>
        </div>
      {:else if plan.kind === "unchanged"}
        <p class="muted">No detail values have changed.</p>
      {:else if plan.kind === "unavailable"}
        <p class="problem" role="alert">{plan.reason}</p>
      {:else}
        <ol class="changes">
          {#each plan.changes as change (change.jsonPath)}
            <li>
              <strong>{change.label}</strong>
              <code>{change.jsonPath}</code>
              <div><span>{change.before}</span><b aria-hidden="true">→</b><span>{change.after}</span></div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <p class="safety">
      Blank optional fields are removed from the structure. Confirmation rereads
      and atomically replaces only <code>200-crappy-words.manuscripts.json</code>.
      Scene and overview Markdown are not edited, and these changes add no words to today.
    </p>

    {#if executionError}<p class="problem" role="alert">{executionError}</p>{/if}

    <footer>
      <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="primary" disabled={busy || Boolean(executionError) || plan.kind !== "ready"} onclick={onConfirm}
        >{busy ? "Saving details…" : "Confirm detail changes"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; z-index: 46; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: rgb(0 0 0 / 66%); }
  .dialog { box-sizing: border-box; width: min(49rem, 100%); max-height: min(48rem, calc(100vh - 2.5rem)); overflow: auto; padding: 1rem; border: 1px solid #505050; border-radius: 8px; box-shadow: 0 18px 54px rgb(0 0 0 / 55%); background: #252525; color: #d4d4d4; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  header { align-items: flex-start; margin-bottom: 0.85rem; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 1.08rem; }
  h3 { margin-top: 0.12rem; font-size: 0.92rem; }
  header small, .muted, .safety { color: #a8a8a8; font-size: 0.73rem; line-height: 1.42; }
  .eyebrow { color: #f6c177; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; color: #c8c8c8; font-size: 0.74rem; font-weight: 600; }
  label.wide { grid-column: 1 / -1; }
  label.compile { flex-direction: row; align-items: center; align-self: end; min-height: 2.2rem; }
  label small { font-weight: 400; }
  input:not([type="checkbox"]), textarea { box-sizing: border-box; width: 100%; padding: 0.48rem 0.55rem; border: 1px solid #505050; border-radius: 4px; outline: none; background: #1e1e1e; color: #eeeeee; font: inherit; resize: vertical; }
  .preview { margin-top: 0.85rem; padding: 0.7rem; border: 1px solid #444444; border-radius: 5px; background: #1f1f1f; }
  .changes { display: grid; gap: 0.45rem; margin: 0.6rem 0 0; padding: 0; list-style: none; }
  .changes li { padding: 0.5rem; border-left: 2px solid #58728a; background: #24282c; }
  .changes li > strong, .changes li > code { display: block; }
  .changes li > code { margin: 0.1rem 0 0.35rem; font-size: 0.68rem; }
  .changes div { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.5rem; align-items: start; }
  .changes div span { overflow-wrap: anywhere; white-space: pre-wrap; color: #bdbdbd; }
  .changes div span:last-child { color: #bfd9c5; }
  code { color: #dcd7ba; overflow-wrap: anywhere; }
  .problem { margin-top: 0.55rem; padding: 0.6rem; border: 1px solid #765a39; border-radius: 4px; background: #352c22; color: #f6c177; font-size: 0.74rem; line-height: 1.4; }
  .problem ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
  .safety { margin-top: 0.75rem; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  button { padding: 0.45rem 0.7rem; border: 1px solid #555555; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary { border-color: #4f7f60; background: #365c43; }
  button.close { padding: 0.1rem 0.35rem; border: 0; background: transparent; font-size: 1.2rem; }
  button:disabled { opacity: 0.55; cursor: default; }
  input:focus-visible, textarea:focus-visible, button:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  @media (max-width: 42rem) { .form-grid { grid-template-columns: 1fr; } label.wide { grid-column: auto; } }
</style>
