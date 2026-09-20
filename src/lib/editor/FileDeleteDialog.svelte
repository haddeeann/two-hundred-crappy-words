<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    fileName: string;
    isMarkdown: boolean;
    isActive: boolean;
    busy: boolean;
    executionError: string;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    fileName,
    isMarkdown,
    isActive,
    busy,
    executionError,
    onCancel,
    onConfirm,
  }: Props = $props();
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
    const focusable = [...dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
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
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="delete-file-heading"
    aria-describedby="delete-file-description"
    tabindex="-1"
    bind:this={dialog}
    onkeydown={handleKeydown}
  >
    <span class="eyebrow">Recoverable deletion</span>
    <h2 id="delete-file-heading">Move “{fileName}” to Trash?</h2>
    <div id="delete-file-description">
      <p>The file will leave this project and can normally be restored from the system Trash until Trash is emptied.</p>
      {#if isActive}
        <p>The active editor will close after any unsaved work is saved or resolved safely.</p>
      {/if}
      {#if isMarkdown}
        <p class="warning">Links and manuscript entries that point to this Markdown file may become unavailable. They will not be rewritten or removed automatically.</p>
      {/if}
    </div>
    {#if executionError}
      <p class="problem" role="alert">{executionError}</p>
    {/if}
    <footer>
      <button type="button" bind:this={cancelButton} disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="danger" disabled={busy} onclick={onConfirm}>
        {busy ? "Moving…" : "Move to Trash"}
      </button>
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
    width: min(30rem, 100%);
    padding: 1rem;
    border: 1px solid #5a4a43;
    border-radius: 8px;
    box-shadow: 0 18px 54px rgb(0 0 0 / 55%);
    background: #252525;
    color: #d4d4d4;
  }

  .eyebrow {
    color: #f6c177;
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25rem 0 0.75rem;
    color: #ffffff;
    font-size: 1.05rem;
  }

  p {
    margin: 0.5rem 0;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .warning,
  .problem {
    color: #f6c177;
  }

  .problem {
    overflow-wrap: anywhere;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  button {
    padding: 0.45rem 0.7rem;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background: #303030;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #3a3a3a;
  }

  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  button.danger {
    border-color: #a14b3f;
    background: #7f332b;
    color: #ffffff;
  }

  button.danger:hover:not(:disabled) {
    background: #974238;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
