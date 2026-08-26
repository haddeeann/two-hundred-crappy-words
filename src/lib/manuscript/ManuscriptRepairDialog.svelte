<script lang="ts">
  import { onMount } from "svelte";
  import type { ManuscriptSourceRepairPlan } from "./repair";

  interface Props {
    plan: ManuscriptSourceRepairPlan;
    busy: boolean;
    executionError: string;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { plan, busy, executionError, onCancel, onConfirm }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let cancelButton = $state<HTMLButtonElement>();

  onMount(() => cancelButton?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    aria-labelledby="repair-manuscript-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="repair-manuscript-heading">Repair manuscript source path</h2>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Cancel manuscript source repair"
        disabled={busy}
        onclick={onCancel}
      >×</button>
    </header>

    {#if plan.kind === "unavailable"}
      <p class="problem" role="alert">{plan.reason}</p>
    {:else}
      <div class="identity">
        <span>{plan.candidate.manuscriptTitle}</span>
        <strong>{plan.candidate.itemTitle}</strong>
        <small>{plan.candidate.bindingLabel} · stable note ID {plan.candidate.noteId}</small>
      </div>

      <section aria-labelledby="repair-change-heading">
        <span class="eyebrow">Exact structure-field change</span>
        <h3 id="repair-change-heading"><code>{plan.jsonPath}</code></h3>
        <div class="path-change">
          <div><span>Recorded path</span><code>{plan.candidate.oldPath}</code></div>
          <span class="arrow" aria-hidden="true">↓</span>
          <div><span>Verified moved path</span><code>{plan.candidate.suggestedPath}</code></div>
        </div>
      </section>

      <p class="safety">
        Confirmation rereads the structure and uniquely identified Markdown source,
        then atomically updates only this path binding. The structure JSON is
        consistently formatted while unknown supported fields and all other values
        remain intact. No Markdown file is edited, moved, renamed, or counted toward
        today’s writing.
      </p>
    {/if}

    {#if executionError}
      <p class="problem" role="alert">{executionError}</p>
    {/if}

    <footer>
      <button type="button" bind:this={cancelButton} disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy || Boolean(executionError) || plan.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Repairing…" : "Confirm path repair"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 46;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: rgb(0 0 0 / 66%);
  }
  .dialog {
    box-sizing: border-box;
    width: min(42rem, 100%);
    max-height: min(44rem, calc(100vh - 2.5rem));
    overflow: auto;
    padding: 1rem;
    border: 1px solid #505050;
    border-radius: 8px;
    box-shadow: 0 18px 54px rgb(0 0 0 / 55%);
    background: #252525;
    color: #d4d4d4;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  header {
    align-items: flex-start;
    margin-bottom: 0.85rem;
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
    margin-top: 0.15rem;
    font-size: 0.78rem;
    font-weight: 500;
  }
  .eyebrow {
    color: #f6c177;
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .identity,
  .identity small,
  .path-change div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .identity {
    padding: 0.65rem;
    border-radius: 5px;
    background: #202a25;
    color: #bfd9c5;
  }
  .identity small,
  .safety {
    color: #a8a8a8;
    font-size: 0.73rem;
    line-height: 1.42;
  }
  section {
    margin-top: 0.8rem;
    padding: 0.7rem;
    border: 1px solid #444444;
    border-radius: 5px;
    background: #1f1f1f;
  }
  .path-change {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
  }
  .path-change div {
    padding: 0.5rem;
    border-left: 2px solid #58728a;
    background: #24282c;
  }
  .path-change span {
    color: #9a9a9a;
    font-size: 0.7rem;
  }
  .path-change .arrow {
    padding-left: 0.5rem;
    color: #a9c7df;
    font-size: 0.9rem;
  }
  code {
    color: #dcd7ba;
    overflow-wrap: anywhere;
  }
  .safety {
    margin-top: 0.8rem;
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
  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }
</style>
