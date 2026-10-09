<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    destination: string;
    paths: readonly string[];
    busy: boolean;
    error: string;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { destination, paths, busy, error, onCancel, onConfirm }: Props = $props();
  let cancelButton: HTMLButtonElement;
  let dialog: HTMLDivElement;

  onMount(() => cancelButton.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not(:disabled), summary, [tabindex]:not([tabindex='-1'])"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sample-project-title" aria-describedby="sample-project-summary" tabindex="-1" bind:this={dialog}>
    <h2 id="sample-project-title">Create the sample world?</h2>
    <p id="sample-project-summary">
      This creates a separate, editable world project. It will not add files to the project already open.
    </p>
    <dl>
      <div><dt>Destination</dt><dd><code>{destination}</code></dd></div>
      <div><dt>Creates</dt><dd>{paths.length} ordinary folders and files</dd></div>
      <div><dt>Existing files</dt><dd>Never overwritten</dd></div>
    </dl>
    <details>
      <summary>Review every path ({paths.length})</summary>
      <ul>
        {#each paths as path}<li><code>{path}</code></li>{/each}
      </ul>
    </details>
    <p class="note">The project manifest is created last. If creation stops, the app removes only files and empty folders made by this attempt and reports anything left behind.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" onclick={onCancel} disabled={busy} bind:this={cancelButton}>Cancel</button>
      <button type="button" class="primary" onclick={onConfirm} disabled={busy}>{busy ? "Creating…" : "Create sample world"}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(0 0 0 / 62%);
  }
  .dialog {
    box-sizing: border-box;
    width: min(38rem, 100%);
    max-height: min(42rem, calc(100vh - 2rem));
    overflow: auto;
    padding: 1.35rem;
    border: 1px solid #555;
    border-radius: 7px;
    background: #252525;
    color: #d4d4d4;
    box-shadow: 0 18px 55px rgb(0 0 0 / 45%);
  }
  h2 { margin: 0 0 0.65rem; color: #fff; }
  p { line-height: 1.5; }
  dl { margin: 1.1rem 0; }
  dl div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 0.75rem; padding: 0.4rem 0; }
  dt { color: #aaa; }
  dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  details { border-block: 1px solid #444; padding: 0.7rem 0; }
  summary { cursor: pointer; font-weight: 600; }
  ul { max-height: 14rem; overflow: auto; margin-bottom: 0; padding-left: 1.4rem; }
  li { margin: 0.3rem 0; }
  code { color: #d9efff; }
  .note { color: #aaa; font-size: 0.9rem; }
  .error { color: #ffb7b7; }
  .actions { display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1.1rem; }
  button { padding: 0.55rem 0.9rem; border: 1px solid #555; border-radius: 5px; background: #303030; color: #ddd; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #3b3b3b; }
  button:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  button:disabled { opacity: 0.65; cursor: default; }
  .primary { border-color: #4da3d9; background: #173247; color: #d9efff; }
  @media (max-width: 520px) { dl div { grid-template-columns: 1fr; gap: 0.1rem; } }
</style>
