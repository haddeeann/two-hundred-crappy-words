<script lang="ts">
  import type { LoreCompletionCandidate } from "./completion";

  interface Props {
    candidates: readonly LoreCompletionCandidate[];
    selectedIndex: number;
    mode: "note" | "heading";
    onSelect: (candidate: LoreCompletionCandidate) => void;
  }

  let { candidates, selectedIndex, mode, onSelect }: Props = $props();
</script>

<div class="completion" aria-label={`Lore ${mode} suggestions`}>
  <div class="completion-heading">
    <strong>{mode === "note" ? "Link a note" : "Link a heading"}</strong>
    <span>↑↓ choose · Enter or Tab insert · Esc close</span>
  </div>
  <div id="lore-completion-list" role="listbox" aria-label={`Lore ${mode} suggestions`}>
    {#each candidates as candidate, index (candidate.key)}
      <button
        id={`lore-completion-option-${index}`}
        type="button"
        role="option"
        aria-selected={index === selectedIndex}
        class:selected={index === selectedIndex}
        tabindex="-1"
        onmousedown={(event) => event.preventDefault()}
        onclick={() => onSelect(candidate)}
      >
        <span class="candidate-label">{candidate.label}</span>
        <span class="candidate-detail">{candidate.detail}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .completion {
    position: absolute;
    z-index: 4;
    top: 0.75rem;
    right: 1.5rem;
    width: min(25rem, calc(100% - 3rem));
    overflow: hidden;
    border: 1px solid #545454;
    border-radius: 6px;
    background: #252526;
    box-shadow: 0 10px 28px rgb(0 0 0 / 38%);
  }

  .completion-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid #3c3c3c;
    color: #d4d4d4;
    font-size: 0.76rem;
  }

  .completion-heading span {
    color: #a0a0a0;
    font-size: 0.68rem;
    text-align: right;
  }

  button {
    display: block;
    width: 100%;
    padding: 0.48rem 0.65rem;
    border: 0;
    border-bottom: 1px solid #333333;
    background: transparent;
    color: #d4d4d4;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:last-child {
    border-bottom: 0;
  }

  button:hover,
  button.selected {
    background: #094771;
  }

  .candidate-label,
  .candidate-detail {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .candidate-label {
    font-weight: 600;
  }

  .candidate-detail {
    margin-top: 0.12rem;
    color: #b8b8b8;
    font-size: 0.72rem;
  }

  button.selected .candidate-detail,
  button:hover .candidate-detail {
    color: #e1e1e1;
  }
</style>
