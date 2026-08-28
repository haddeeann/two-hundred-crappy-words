<script lang="ts">
  import { onMount } from "svelte";
  import type { ManuscriptSceneMergePlan, ManuscriptSceneMergeRequest } from "./merge";

  interface Props {
    request: ManuscriptSceneMergeRequest;
    plan: ManuscriptSceneMergePlan;
    busy: boolean;
    executionError: string;
    onRequest: (request: ManuscriptSceneMergeRequest) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { request, plan, busy, executionError, onRequest, onCancel, onConfirm }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let cancelButton = $state<HTMLButtonElement>();

  onMount(() => cancelButton?.focus());

  function update(changes: Partial<ManuscriptSceneMergeRequest>): void {
    onRequest({ ...request, ...changes });
  }

  function boundaryLabel(value: string): string {
    if (!value) return "No bytes inserted";
    return value.replaceAll("\r", "\\r").replaceAll("\n", "\\n");
  }

  function endPreview(text: string): string {
    return text.length <= 600 ? text : `…${text.slice(-600)}`;
  }

  function startPreview(text: string): string {
    return text.length <= 600 ? text : `${text.slice(0, 600)}…`;
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
    aria-labelledby="scene-merge-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="scene-merge-heading">Merge adjacent scenes</h2>
      </div>
      <button type="button" class="close" aria-label="Cancel scene merge" disabled={busy} onclick={onCancel}>×</button>
    </header>

    {#if plan.kind === "unavailable"}
      <p class="problem" role="alert">{plan.reason}</p>
    {:else}
      <div class="identity">
        <span>{plan.target.manuscriptTitle} · {plan.target.containerLabel}</span>
        <strong>{plan.target.leftSceneTitle} + {plan.target.rightSceneTitle}</strong>
        <small>
          Survives: <code>{plan.target.leftSceneId}</code>. Retires from active structure:
          <code>{plan.target.rightSceneId}</code>. The complete left object and metadata stay unchanged;
          the right object is minimal and is removed without discarding its prose.
        </small>
      </div>

      <fieldset disabled={busy}>
        <legend>Prose boundary</legend>
        <label>
          <input
            type="radio"
            name="merge-boundary"
            checked={request.join === "blank-line"}
            onchange={() => update({ join: "blank-line" })}
          />
          Ensure one blank line between scenes
        </label>
        <label>
          <input
            type="radio"
            name="merge-boundary"
            checked={request.join === "preserve"}
            onchange={() => update({ join: "preserve" })}
          />
          Preserve the exact existing boundary
        </label>
      </fieldset>

      <section aria-labelledby="merge-boundary-heading">
        <span class="eyebrow">Exact prose join</span>
        <h3 id="merge-boundary-heading">Inserted boundary: <code>{boundaryLabel(plan.target.insertedBoundary)}</code></h3>
        <div class="previews">
          <article>
            <span>End of surviving source</span>
            <code>{plan.target.leftSourcePath}</code>
            <pre>{endPreview(plan.originalLeftSourceText)}</pre>
          </article>
          <article>
            <span>Start of retiring source</span>
            <code>{plan.target.rightSourcePath}</code>
            <pre>{startPreview(plan.originalRightSourceText)}</pre>
          </article>
        </div>
      </section>

      <section aria-labelledby="merge-files-heading">
        <span class="eyebrow">Every affected file</span>
        <h3 id="merge-files-heading">Four guarded paths</h3>
        <dl>
          <div><dt>Replaced with merged prose</dt><dd><code>{plan.target.leftSourcePath}</code></dd></div>
          <div><dt>Renamed without clobbering</dt><dd><code>{plan.target.rightSourcePath}</code></dd></div>
          <div><dt>Exact visible backup</dt><dd><code>{plan.target.retiredSourcePath}</code></dd></div>
          <div><dt>Right object removed at <code>{plan.target.arrayJsonPath}[{plan.target.rightPosition - 1}]</code></dt><dd><code>200-crappy-words.manuscripts.json</code></dd></div>
        </dl>
      </section>

      <p class="safety">
        Confirmation freshly rereads both Markdown sources and the structure, rechecks that the
        retirement path is absent, regenerates this exact plan, and commits through a rollback-safe
        native transaction. Undo is available only while the merged source, retired backup,
        original right path, and structure remain exact. This does not add to today’s writing total.
      </p>
    {/if}

    {#if executionError}<p class="problem" role="alert">{executionError}</p>{/if}

    <footer>
      <button bind:this={cancelButton} type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy || plan.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Merging…" : "Confirm scene merge"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; z-index: 47; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: rgb(0 0 0 / 66%); }
  .dialog { box-sizing: border-box; width: min(60rem, 100%); max-height: min(54rem, calc(100vh - 2.5rem)); overflow: auto; padding: 1rem; border: 1px solid #505050; border-radius: 8px; box-shadow: 0 18px 54px rgb(0 0 0 / 55%); background: #252525; color: #d4d4d4; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  header { align-items: flex-start; margin-bottom: 0.85rem; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 1.08rem; }
  h3 { margin-top: 0.15rem; font-size: 0.86rem; }
  .eyebrow { color: #f6c177; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  .identity, .identity small { display: flex; flex-direction: column; gap: 0.18rem; }
  .identity { padding: 0.65rem; border-radius: 5px; background: #202a25; color: #bfd9c5; }
  .identity small, .safety { color: #a8a8a8; font-size: 0.73rem; line-height: 1.42; }
  fieldset { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; margin: 0.8rem 0 0; padding: 0.65rem; border: 1px solid #4a4a4a; }
  legend { padding: 0 0.25rem; color: #bdbdbd; font-size: 0.75rem; }
  label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; }
  section { margin-top: 0.8rem; padding: 0.7rem; border: 1px solid #444444; border-radius: 5px; background: #1f1f1f; }
  .previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; margin-top: 0.65rem; }
  article { min-width: 0; padding: 0.55rem; border-left: 2px solid #58728a; background: #24282c; }
  article > span { display: block; color: #9a9a9a; font-size: 0.7rem; }
  code { color: #dcd7ba; overflow-wrap: anywhere; }
  pre { min-height: 7rem; max-height: 13rem; overflow: auto; margin: 0.5rem 0 0; padding: 0.55rem; border-radius: 3px; white-space: pre-wrap; overflow-wrap: anywhere; background: #1c1c1c; color: #d0d0d0; font: 0.74rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  dl { display: grid; gap: 0.4rem; margin: 0.6rem 0 0; }
  dl div { display: grid; grid-template-columns: minmax(9rem, 0.7fr) minmax(0, 1.3fr); gap: 0.5rem; }
  dt { color: #a9a9a9; font-size: 0.72rem; }
  dd { min-width: 0; margin: 0; }
  .safety { margin-top: 0.8rem; }
  .problem { margin-top: 0.65rem; padding: 0.6rem; border: 1px solid #765a39; border-radius: 4px; background: #352c22; color: #f6c177; font-size: 0.74rem; line-height: 1.4; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  button { padding: 0.45rem 0.7rem; border: 1px solid #555555; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary { border-color: #4f7f60; background: #365c43; }
  button.close { padding: 0.1rem 0.35rem; border: 0; background: transparent; font-size: 1.2rem; }
  button:disabled { opacity: 0.55; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  @media (max-width: 42rem) { .previews, dl div { grid-template-columns: 1fr; } }
</style>
