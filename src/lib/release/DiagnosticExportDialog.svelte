<script lang="ts">
  let {
    content,
    busy,
    error,
    onSave,
    onCancel,
  }: {
    content: string;
    busy: boolean;
    error: string;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
  let dialog: HTMLDivElement;

  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Tab") {
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
      );
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0 ? focusable.at(-1) : focusable[index - 1]
        : index < 0 || index === focusable.length - 1 ? focusable[0] : focusable[index + 1];
      event.preventDefault();
      next?.focus();
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="backdrop" role="presentation">
  <div bind:this={dialog} class="dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title" aria-describedby="diagnostic-description">
    <header>
      <p class="eyebrow">PRIVATE BY DESIGN</p>
      <h2 id="diagnostic-title">Export content-free diagnostics</h2>
      <p id="diagnostic-description">Review the complete file below before choosing where to save it. Nothing is uploaded.</p>
    </header>
    <p class="exclusions">This report excludes writing, filenames, paths, project names and IDs, word totals, recovery text, permission scopes, and logs.</p>
    <textarea readonly aria-label="Exact diagnostic file contents" value={content}></textarea>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      <!-- svelte-ignore a11y_autofocus -->
      <button type="button" class="primary" onclick={onSave} disabled={busy} autofocus>{busy ? "Saving…" : "Save As…"}</button>
      <button type="button" onclick={onCancel} disabled={busy}>Cancel</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1rem; background: rgba(0,0,0,.72); }
  .dialog { box-sizing: border-box; width: min(46rem, 100%); max-height: min(44rem, calc(100vh - 2rem)); overflow: auto; padding: 1.25rem; border: 1px solid #555; border-radius: 8px; background: #252525; color: #d4d4d4; box-shadow: 0 1rem 3rem rgba(0,0,0,.45); }
  h2, p { margin: 0; }
  h2 { margin-top: .2rem; color: #fff; }
  header > p:last-child, .exclusions { margin-top: .55rem; color: #aaa; line-height: 1.45; }
  .eyebrow { color: #9fcba4; font-size: .72rem; font-weight: 700; letter-spacing: .08em; }
  .exclusions { padding: .7rem .8rem; border-left: 3px solid #73a47c; background: #202720; }
  textarea { box-sizing: border-box; width: 100%; height: 21rem; resize: vertical; margin: 1rem 0 0; padding: .85rem; border: 1px solid #444; border-radius: 5px; background: #181818; color: #d7e5d9; font: .78rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  footer { display: flex; gap: .6rem; justify-content: flex-end; margin-top: 1rem; }
  button { padding: .5rem .75rem; border: 1px solid #555; border-radius: 5px; background: #333; color: #ddd; font: inherit; cursor: pointer; }
  button.primary { border-color: #5f8a66; background: #2c3b2f; }
  button:focus-visible, textarea:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: default; }
  .error { margin-top: .75rem; color: #f48771; }
</style>
