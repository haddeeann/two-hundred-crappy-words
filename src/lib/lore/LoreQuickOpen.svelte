<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { LoreSearchResult } from "./search";

  interface Props {
    query: string;
    results: readonly LoreSearchResult[];
    selectedIndex: number;
    phase: "idle" | "indexing" | "ready" | "stale" | "error";
    hasIndex: boolean;
    onQuery: (value: string) => void;
    onMove: (index: number) => void;
    onOpen: (result: LoreSearchResult) => void;
    onReference: (result: LoreSearchResult) => void;
    onClose: () => void;
  }

  let {
    query,
    results,
    selectedIndex,
    phase,
    hasIndex,
    onQuery,
    onMove,
    onOpen,
    onReference,
    onClose,
  }: Props = $props();
  let input = $state<HTMLInputElement>();
  let closeButton = $state<HTMLButtonElement>();

  onMount(async () => {
    await tick();
    input?.focus({ preventScroll: true });
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      closeButton?.focus();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      onMove((selectedIndex + direction + results.length) % results.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      onMove(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onMove(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        if (event.shiftKey) onReference(selected);
        else onOpen(selected);
      }
    }
  }

  function handleCloseKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      event.preventDefault();
      input?.focus();
    }
  }

  const status = $derived.by(() => {
    if (!hasIndex && phase === "indexing") return "The lore index is still being prepared.";
    if (!hasIndex) return "No searchable lore index is available. Open or refresh a project folder, then try again.";
    if (results.length === 0) return query ? `No indexed note matches “${query}”.` : "No Markdown notes are indexed.";
    if (phase === "stale") return "Showing the last available in-memory index; refresh is recommended.";
    if (phase === "indexing") return "Showing the last available results while the index refreshes.";
    return `${results.length} ${results.length === 1 ? "result" : "results"}; use the arrow keys to choose.`;
  });
</script>

<div class="backdrop" role="presentation" onmousedown={(event) => {
  if (event.target === event.currentTarget) onClose();
}}>
  <div
    class="quick-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="quick-open-title"
    aria-describedby="quick-open-status quick-open-help"
  >
    <header>
      <div>
        <h1 id="quick-open-title">Open a note</h1>
        <p id="quick-open-help">Search titles, aliases, paths, headings, and text. Nothing is saved.</p>
      </div>
      <button
        bind:this={closeButton}
        type="button"
        class="close"
        aria-label="Close quick opener"
        onclick={onClose}
        onkeydown={handleCloseKeydown}
      >×</button>
    </header>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:this={input}
      value={query}
      maxlength="120"
      placeholder="Find a note…"
      aria-label="Search project notes"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={results.length > 0}
      aria-controls="quick-open-results"
      aria-activedescendant={results.length > 0
        ? `quick-open-result-${selectedIndex}`
        : undefined}
      autocomplete="off"
      spellcheck="false"
      autofocus
      oninput={(event) => onQuery((event.currentTarget as HTMLInputElement).value)}
      onkeydown={handleKeydown}
    />
    <p id="quick-open-status" class="status" role="status" aria-live="polite">{status}</p>
    <div id="quick-open-results" class="results" role="listbox" aria-label="Project search results">
      {#each results as result, index (result.key)}
        <button
          id={`quick-open-result-${index}`}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          class:selected={index === selectedIndex}
          tabindex="-1"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => onOpen(result)}
        >
          <span class="result-title">{result.title}</span>
          <span class="result-reason">{result.reason}</span>
          <span class="result-path">{result.path}</span>
          {#if result.context && result.context !== result.path}
            <span class="result-context">{result.context}</span>
          {/if}
        </button>
      {/each}
    </div>
    <footer>↑↓ choose · Enter edit · Shift+Enter beside · Esc close · Command/Ctrl+P</footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: clamp(3.5rem, 12vh, 7rem) 1rem 1rem;
    background: rgb(0 0 0 / 56%);
  }

  .quick-open {
    display: flex;
    flex-direction: column;
    width: min(42rem, 100%);
    max-height: min(38rem, calc(100vh - 5rem));
    overflow: hidden;
    border: 1px solid #5a5a5a;
    border-radius: 8px;
    background: #252526;
    box-shadow: 0 18px 50px rgb(0 0 0 / 52%);
    color: #d4d4d4;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem 0.65rem;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-size: 1rem;
  }

  header p {
    margin-top: 0.2rem;
    color: #a8a8a8;
    font-size: 0.74rem;
  }

  .close {
    width: 1.75rem;
    height: 1.75rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #c8c8c8;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    background: #3a3a3a;
  }

  input {
    box-sizing: border-box;
    width: calc(100% - 2rem);
    margin: 0 1rem;
    padding: 0.7rem 0.75rem;
    border: 1px solid #6a6a6a;
    border-radius: 5px;
    outline: none;
    background: #1e1e1e;
    color: #f0f0f0;
    font: inherit;
  }

  input:focus-visible,
  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .status {
    padding: 0.55rem 1rem;
    color: #b8b8b8;
    font-size: 0.74rem;
  }

  .results {
    flex: 1 1 auto;
    overflow: auto;
    border-top: 1px solid #3c3c3c;
    border-bottom: 1px solid #3c3c3c;
  }

  .results button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.14rem 0.9rem;
    width: 100%;
    padding: 0.62rem 1rem;
    border: 0;
    border-bottom: 1px solid #333333;
    background: transparent;
    color: #d4d4d4;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .results button:last-child {
    border-bottom: 0;
  }

  .results button:hover,
  .results button.selected {
    background: #094771;
  }

  .result-title,
  .result-path,
  .result-context {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-title {
    font-weight: 650;
  }

  .result-reason {
    color: #b7d8ee;
    font-size: 0.72rem;
  }

  .result-path,
  .result-context {
    color: #a8a8a8;
    font-size: 0.72rem;
  }

  .result-context {
    grid-column: 1 / -1;
    color: #c8c8c8;
  }

  footer {
    padding: 0.5rem 1rem;
    color: #a8a8a8;
    font-size: 0.7rem;
    text-align: right;
  }
</style>
