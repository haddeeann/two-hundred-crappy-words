<script lang="ts">
  import { onMount } from "svelte";
  import type { LoreRenamePlan } from "./rename";

  interface Props {
    sourcePath: string;
    requestedPath: string;
    plan: LoreRenamePlan;
    busy: boolean;
    executionError: string;
    onRequestedPath: (path: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    sourcePath,
    requestedPath,
    plan,
    busy,
    executionError,
    onRequestedPath,
    onCancel,
    onConfirm,
  }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let pathInput = $state<HTMLInputElement>();

  onMount(() => {
    pathInput?.focus();
    pathInput?.select();
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

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="rename-lore-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="rename-lore-heading">Rename lore note</h2>
      </div>
      <button type="button" class="close" aria-label="Cancel lore rename" disabled={busy} onclick={onCancel}>×</button>
    </header>

    <label for="lore-rename-path">New project-relative Markdown path</label>
    <input
      id="lore-rename-path"
      bind:this={pathInput}
      value={requestedPath}
      disabled={busy}
      aria-invalid={plan.kind === "unavailable"}
      oninput={(event) => onRequestedPath(event.currentTarget.value)}
    />
    <p class="move"><code>{sourcePath}</code> → <code>{requestedPath || "…"}</code></p>

    {#if plan.kind === "unavailable"}
      <p class="problem" role="alert">{plan.reason}</p>
    {:else}
      <div class="summary" aria-live="polite">
        <strong>{plan.fileEdits.length} {plan.fileEdits.length === 1 ? "file needs" : "files need"} exact link edits.</strong>
        <span>{plan.unchangedLinkCount} resolved {plan.unchangedLinkCount === 1 ? "link remains" : "links remain"} valid and will not be rewritten.</span>
      </div>
      {#if plan.fileEdits.length > 0}
        <div class="edits" aria-label="Previewed link edits">
          {#each plan.fileEdits as file (file.path)}
            <details>
              <summary>{file.path} · {file.replacements.length} {file.replacements.length === 1 ? "edit" : "edits"}</summary>
              <ul>
                {#each file.replacements as replacement (`${replacement.range.start}:${replacement.after}`)}
                  <li>
                    <code>{replacement.before}</code> → <code>{replacement.after}</code>
                    <small>{file.path}:{replacement.range.line}:{replacement.range.column}</small>
                    {#if replacement.context}<blockquote>{replacement.context}</blockquote>{/if}
                  </li>
                {/each}
              </ul>
            </details>
          {/each}
        </div>
      {/if}
      <p class="safety">
        Confirmation rechecks every source, never overwrites the destination, and rolls completed link edits back if the move cannot finish. No title or prose is changed automatically.
      </p>
    {/if}

    {#if executionError}
      <p class="problem" role="alert">{executionError}</p>
    {/if}

    <footer>
      <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy || plan.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Renaming…" : "Confirm rename"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 40;
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
  footer,
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
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.05rem;
  }

  .eyebrow {
    color: #f6c177;
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  label {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.76rem;
    font-weight: 600;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border: 1px solid #555555;
    border-radius: 4px;
    outline: none;
    background: #1e1e1e;
    color: #eeeeee;
    font: 0.8rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  input[aria-invalid="true"] {
    border-color: #b7844b;
  }

  input:focus-visible,
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .move,
  .problem,
  .safety,
  .summary {
    margin-top: 0.65rem;
    font-size: 0.74rem;
    line-height: 1.4;
  }

  .move,
  .safety {
    color: #a8a8a8;
    overflow-wrap: anywhere;
  }

  .problem {
    padding: 0.6rem;
    border: 1px solid #765a39;
    border-radius: 4px;
    background: #352c22;
    color: #f6c177;
  }

  .summary {
    align-items: flex-start;
    flex-direction: column;
    padding: 0.65rem;
    border-radius: 4px;
    background: #202a25;
    color: #b9d7c0;
  }

  .edits {
    margin-top: 0.7rem;
    border: 1px solid #444444;
    border-radius: 4px;
  }

  details + details {
    border-top: 1px solid #444444;
  }

  summary {
    padding: 0.55rem 0.65rem;
    cursor: pointer;
    font-size: 0.76rem;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0 0.65rem 0.55rem;
    list-style: none;
  }

  li {
    padding: 0.45rem 0;
    border-top: 1px solid #383838;
    font-size: 0.72rem;
  }

  code {
    color: #dcd7ba;
    overflow-wrap: anywhere;
  }

  small {
    display: block;
    margin-top: 0.2rem;
    color: #969696;
  }

  blockquote {
    margin: 0.3rem 0 0;
    padding-left: 0.55rem;
    border-left: 2px solid #545454;
    color: #bdbdbd;
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

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  button.close {
    padding: 0.1rem 0.35rem;
    border: 0;
    background: transparent;
    font-size: 1.2rem;
  }
</style>
