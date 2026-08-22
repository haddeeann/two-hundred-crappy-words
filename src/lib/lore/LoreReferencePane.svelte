<script lang="ts">
  import type { LoreReferenceView } from "./reference";

  interface Props {
    reference: LoreReferenceView;
    onClose: () => void;
    onOpenEditor: (path: string) => void;
    onRename: (path: string) => void;
    onRetry: (path: string) => void;
  }

  let { reference, onClose, onOpenEditor, onRename, onRetry }: Props = $props();
</script>

<aside
  id="lore-reference-pane"
  class="reference"
  aria-label="Lore reference"
  tabindex="-1"
>
  <header>
    <div>
      <span class="eyebrow">Read-only reference</span>
      <h2>{reference.phase === "ready" ? reference.title : "Lore reference"}</h2>
      <p>{reference.path}</p>
    </div>
    <button type="button" class="close" aria-label="Close lore reference" onclick={onClose}>×</button>
  </header>

  {#if reference.phase === "loading"}
    <p class="message" role="status">Verifying this note inside the selected project…</p>
  {:else if reference.phase === "ready"}
    <textarea
      class="reference-content"
      aria-label={`Read-only contents of ${reference.title}`}
      value={reference.text}
      readonly
    ></textarea>
    <footer>
      <span>Plain Markdown · changes stay in the main editor</span>
      <div class="actions">
        <button type="button" onclick={() => onRename(reference.path)}>Rename note…</button>
        <button type="button" onclick={() => onOpenEditor(reference.path)}>Open in editor</button>
      </div>
    </footer>
  {:else}
    <div class="message" role={reference.phase === "error" ? "alert" : "status"}>
      <p>{reference.message}</p>
      <button type="button" onclick={() => onRetry(reference.path)}>Try again</button>
    </div>
  {/if}
</aside>

<style>
  .reference {
    flex: 0 0 clamp(19rem, 38%, 34rem);
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid #484848;
    outline: none;
    background: #202020;
    color: #d4d4d4;
  }

  .reference:focus-visible {
    box-shadow: inset 0 0 0 2px #75beff;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
    border-bottom: 1px solid #3c3c3c;
    background: #262626;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    margin-top: 0.08rem;
    font-size: 0.95rem;
  }

  header p {
    margin-top: 0.2rem;
    color: #a0a0a0;
    font-size: 0.7rem;
    overflow-wrap: anywhere;
  }

  .eyebrow {
    color: #a7d7ad;
    font-size: 0.66rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .close {
    flex: 0 0 auto;
    width: 1.7rem;
    height: 1.7rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #c8c8c8;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    background: #3a3a3a;
  }

  button:focus-visible,
  .reference-content:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .reference-content {
    flex: 1 1 auto;
    box-sizing: border-box;
    min-height: 0;
    margin: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: auto;
    padding: 1rem;
    background: #202020;
    color: #d4d4d4;
    font: 0.82rem/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.9rem;
    border-top: 1px solid #3c3c3c;
    color: #a8a8a8;
    font-size: 0.68rem;
  }

  footer button,
  .message button {
    padding: 0.35rem 0.5rem;
    border: 1px solid #515151;
    border-radius: 4px;
    background: #303030;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  .actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.4rem;
  }

  footer button:hover,
  .message button:hover {
    background: #3a3a3a;
  }

  .message {
    margin: 1rem;
    color: #c8c8c8;
    line-height: 1.45;
  }

  .message button {
    margin-top: 0.75rem;
  }

  @media (max-width: 820px) {
    .reference {
      position: absolute;
      z-index: 5;
      inset: 0 0 0 auto;
      width: min(88%, 34rem);
      box-shadow: -10px 0 28px rgb(0 0 0 / 42%);
    }
  }
</style>
