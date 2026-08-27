<script lang="ts">
  import { onMount } from "svelte";
  import type { ManuscriptSceneSplitPlan, ManuscriptSceneSplitRequest } from "./split";

  interface Props {
    request: ManuscriptSceneSplitRequest;
    plan: ManuscriptSceneSplitPlan;
    busy: boolean;
    executionError: string;
    onRequest: (request: ManuscriptSceneSplitRequest) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { request, plan, busy, executionError, onRequest, onCancel, onConfirm }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let titleInput = $state<HTMLInputElement>();

  onMount(() => titleInput?.focus());

  function update(changes: Partial<ManuscriptSceneSplitRequest>): void {
    onRequest({ ...request, ...changes });
  }

  function preview(text: string): string {
    const limit = 900;
    return text.length <= limit ? text : `${text.slice(0, limit)}\n…`;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    aria-labelledby="scene-split-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="scene-split-heading">Split scene at the caret</h2>
      </div>
      <button type="button" class="close" aria-label="Cancel scene split" disabled={busy} onclick={onCancel}>×</button>
    </header>

    <div class="controls">
      <label>
        New scene title
        <input
          bind:this={titleInput}
          value={request.newSceneTitle}
          disabled={busy}
          oninput={(event) => update({ newSceneTitle: event.currentTarget.value })}
        />
      </label>
      <label>
        New Markdown path
        <input
          value={request.newSourcePath}
          disabled={busy}
          spellcheck="false"
          oninput={(event) => update({ newSourcePath: event.currentTarget.value })}
        />
      </label>
    </div>

    {#if plan.kind === "unavailable"}
      <p class="problem" role="alert">{plan.reason}</p>
    {:else}
      <div class="identity">
        <span>{plan.target.manuscriptTitle} · {plan.target.containerLabel}</span>
        <strong>{plan.target.sceneTitle} → {plan.target.newSceneTitle}</strong>
        <small>The original scene keeps its ID, source path, and all metadata. The new scene receives a new ID and only inherits compile exclusion.</small>
      </div>

      <section aria-labelledby="scene-split-preview-heading">
        <span class="eyebrow">Exact prose boundary</span>
        <h3 id="scene-split-preview-heading">The caret becomes the file boundary</h3>
        <div class="previews">
          <article>
            <span>Left stays in</span>
            <code>{plan.target.sourcePath}</code>
            <pre>{preview(plan.leftSourceText)}</pre>
          </article>
          <article>
            <span>Right moves to</span>
            <code>{plan.target.newSourcePath}</code>
            <pre>{preview(plan.rightSourceText)}</pre>
          </article>
        </div>
      </section>

      <p class="safety">
        Confirmation rereads the source and structure, then changes the two Markdown
        files and <code>200-crappy-words.manuscripts.json</code> as one guarded
        transaction. A one-step Undo is available only while all three results remain
        unchanged. This does not add to today’s writing total.
      </p>
    {/if}

    {#if executionError}<p class="problem" role="alert">{executionError}</p>{/if}

    <footer>
      <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy || plan.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Splitting…" : "Confirm scene split"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; z-index: 47; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: rgb(0 0 0 / 66%); }
  .dialog { box-sizing: border-box; width: min(58rem, 100%); max-height: min(52rem, calc(100vh - 2.5rem)); overflow: auto; padding: 1rem; border: 1px solid #505050; border-radius: 8px; box-shadow: 0 18px 54px rgb(0 0 0 / 55%); background: #252525; color: #d4d4d4; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  header { align-items: flex-start; margin-bottom: 0.85rem; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 1.08rem; }
  h3 { margin-top: 0.15rem; font-size: 0.86rem; }
  .eyebrow { color: #f6c177; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  .controls { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 0.65rem; }
  label { display: flex; flex-direction: column; gap: 0.3rem; color: #bdbdbd; font-size: 0.75rem; }
  input { width: 100%; box-sizing: border-box; padding: 0.48rem; border: 1px solid #555555; border-radius: 4px; background: #1f1f1f; color: #e0e0e0; font: inherit; }
  .identity, .identity small { display: flex; flex-direction: column; gap: 0.15rem; }
  .identity { margin-top: 0.8rem; padding: 0.65rem; border-radius: 5px; background: #202a25; color: #bfd9c5; }
  .identity small, .safety { color: #a8a8a8; font-size: 0.73rem; line-height: 1.42; }
  section { margin-top: 0.8rem; padding: 0.7rem; border: 1px solid #444444; border-radius: 5px; background: #1f1f1f; }
  .previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; margin-top: 0.65rem; }
  article { min-width: 0; padding: 0.55rem; border-left: 2px solid #58728a; background: #24282c; }
  article > span { display: block; color: #9a9a9a; font-size: 0.7rem; }
  code { color: #dcd7ba; overflow-wrap: anywhere; }
  pre { min-height: 7rem; max-height: 15rem; overflow: auto; margin: 0.5rem 0 0; padding: 0.55rem; border-radius: 3px; white-space: pre-wrap; overflow-wrap: anywhere; background: #1c1c1c; color: #d0d0d0; font: 0.74rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .safety { margin-top: 0.8rem; }
  .problem { margin-top: 0.65rem; padding: 0.6rem; border: 1px solid #765a39; border-radius: 4px; background: #352c22; color: #f6c177; font-size: 0.74rem; line-height: 1.4; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  button { padding: 0.45rem 0.7rem; border: 1px solid #555555; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary { border-color: #4f7f60; background: #365c43; }
  button.close { padding: 0.1rem 0.35rem; border: 0; background: transparent; font-size: 1.2rem; }
  button:disabled { opacity: 0.55; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  @media (max-width: 42rem) { .controls, .previews { grid-template-columns: 1fr; } }
</style>
