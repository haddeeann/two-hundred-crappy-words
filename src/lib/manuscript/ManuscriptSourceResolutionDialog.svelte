<script lang="ts">
  import type { ManuscriptSourceResolutionPlan } from "./source-resolution";

  interface Props {
    plan: Exclude<ManuscriptSourceResolutionPlan, { kind: "unavailable" }>;
    busy: boolean;
    error: string;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { plan, busy, error, onCancel, onConfirm }: Props = $props();
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
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current - 1 + focusable.length) % focusable.length
      : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }

  function actionTitle(): string {
    if (plan.kind === "locate") return "Use located source";
    if (plan.kind === "create") return "Create missing source";
    return "Remove scene from manuscript";
  }

  function confirmLabel(): string {
    if (plan.kind === "locate") return busy ? "Checking…" : "Update source path";
    if (plan.kind === "create") return busy ? "Checking…" : "Create source";
    return busy ? "Checking…" : "Remove scene entry";
  }
</script>

<svelte:window onkeydowncapture={handleKeydown} />

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="source-resolution-heading"
    tabindex="-1"
    bind:this={dialog}
  >
    <span class="eyebrow">Explicit compile resolution</span>
    <h2 id="source-resolution-heading">{actionTitle()}</h2>
    <div class="identity">
      <span>{plan.target.manuscriptTitle}</span>
      <strong>{plan.target.itemTitle}</strong>
      <small>{plan.target.itemKind} · {plan.target.itemId}</small>
    </div>

    {#if plan.kind === "locate"}
      <section aria-labelledby="locate-change-heading">
        <h3 id="locate-change-heading">Exact structure path change</h3>
        <code>{plan.target.jsonPath}.source.path</code>
        <div class="path-change">
          <div><span>Missing path</span><code>{plan.target.declaredPath}</code></div>
          <span aria-hidden="true">↓</span>
          <div><span>Selected verified source</span><code>{plan.selectedPath}</code></div>
        </div>
        <p>{plan.selectedBytes.toLocaleString()} source bytes were freshly read for this preview.</p>
        <p>Only the structure binding changes. The selected Markdown file is not edited, moved, copied, or counted toward Today.</p>
      </section>
    {:else if plan.kind === "create"}
      <section aria-labelledby="create-source-heading">
        <h3 id="create-source-heading">Create-new Markdown path</h3>
        <code>{plan.target.declaredPath}</code>
        {#if plan.target.noteId}
          <p>The new source begins with only the stable note ID already recorded by the structure. It contains no prose.</p>
        {:else}
          <p>The new source is an empty Markdown file ready for prose.</p>
        {/if}
        <p>The parent folder must still be a real contained project folder. An existing destination is never overwritten.</p>
      </section>
    {:else}
      <section aria-labelledby="remove-scene-heading">
        <h3 id="remove-scene-heading">Structure-only removal</h3>
        <code>{plan.target.jsonPath}</code>
        <p>The scene entry and its planning metadata leave the manuscript structure.</p>
        <p><strong>No Markdown file is deleted.</strong> If prose later appears at <code>{plan.target.declaredPath}</code>, it remains an ordinary project file.</p>
      </section>
    {/if}

    <p class="safety">Confirmation freshly rereads the manuscript structure and relevant source state. A stale preview refuses the change.</p>
    {#if error}<p class="problem" role="alert">{error}</p>{/if}

    <footer>
      <button type="button" bind:this={cancelButton} disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="primary" disabled={busy} onclick={onConfirm}>{confirmLabel()}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; z-index: 46; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: rgb(0 0 0 / 66%); }
  .dialog { box-sizing: border-box; width: min(39rem, 100%); max-height: calc(100vh - 2.5rem); overflow: auto; padding: 1rem; border: 1px solid #4b4b4b; border-radius: 8px; box-shadow: 0 18px 54px rgb(0 0 0 / 55%); background: #252525; color: #d4d4d4; }
  .eyebrow { color: #75beff; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  h2 { margin: 0.25rem 0 0.8rem; color: #fff; font-size: 1.08rem; }
  h3 { margin: 0 0 0.45rem; color: #e6e6e6; font-size: 0.86rem; }
  section { margin-top: 0.9rem; padding: 0.75rem; border: 1px solid #414141; border-radius: 6px; background: #202020; }
  p { margin: 0.55rem 0 0; line-height: 1.42; }
  code { color: #d7ba7d; overflow-wrap: anywhere; }
  .identity { display: grid; gap: 0.18rem; padding: 0.65rem; border-radius: 6px; background: #303030; }
  .identity span, .identity small, section p, .safety { color: #b7b7b7; }
  .path-change { display: grid; gap: 0.35rem; margin-top: 0.65rem; }
  .path-change div { display: grid; gap: 0.15rem; }
  .path-change span { color: #999; font-size: 0.72rem; }
  .problem { color: #f48771; overflow-wrap: anywhere; }
  footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  button { padding: 0.42rem 0.65rem; border: 1px solid #4b4b4b; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button.primary { border-color: #0e639c; background: #0e639c; color: white; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary:hover:not(:disabled) { background: #1177bb; }
  button:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  button:disabled { opacity: 0.55; cursor: default; }
</style>
