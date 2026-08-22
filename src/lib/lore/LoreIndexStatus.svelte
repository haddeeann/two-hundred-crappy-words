<script lang="ts">
  import type { LoreScanIssue } from "./scan";

  interface Props {
    phase: "idle" | "indexing" | "ready" | "stale" | "error";
    documentCount: number;
    issueCount: number;
    scanIssues: readonly LoreScanIssue[];
    indexIssueMessages: readonly string[];
    suppressedIssueCount: number;
    errorMessage: string;
    onRefresh: () => void;
  }

  let {
    phase,
    documentCount,
    issueCount,
    scanIssues,
    indexIssueMessages,
    suppressedIssueCount,
    errorMessage,
    onRefresh,
  }: Props = $props();

  const summary = $derived.by(() => {
    if (phase === "indexing") return "Lore index: scanning…";
    if (phase === "error") return "Lore index: unavailable";
    if (phase === "stale") return "Lore index: refresh needed";
    if (phase === "ready") {
      return `Lore index: ${documentCount.toLocaleString()} ${documentCount === 1 ? "note" : "notes"}`;
    }
    return "Lore index";
  });
  const visibleIssues = $derived([
    ...scanIssues.map((issue) => `${issue.path || "Project root"}: ${issue.message}`),
    ...indexIssueMessages,
  ].slice(0, 5));
  const hiddenIssueCount = $derived(
    Math.max(0, scanIssues.length + indexIssueMessages.length - visibleIssues.length) +
      suppressedIssueCount,
  );
</script>

<details class="lore-index-status">
  <summary>{summary}</summary>
  <p>
    Markdown titles, headings, and links are derived in memory. Creative text
    is not added to app data or sent anywhere.
  </p>
  {#if phase === "indexing"}
    <p role="status" aria-live="polite">Scanning the selected project folder safely.</p>
  {:else if phase === "error"}
    <p class="lore-index-error" role="alert">{errorMessage}</p>
  {:else if phase === "stale"}
    <p class="lore-index-error" role="status">
      {errorMessage || "The last index may be out of date."}
    </p>
  {/if}
  {#if issueCount > 0}
    <p>{issueCount.toLocaleString()} {issueCount === 1 ? "issue needs" : "issues need"} attention.</p>
  {/if}
  {#if visibleIssues.length > 0}
    <ul>
      {#each visibleIssues as issue}
        <li>{issue}</li>
      {/each}
    </ul>
    {#if hiddenIssueCount > 0}
      <p>
        {hiddenIssueCount} more {hiddenIssueCount === 1 ? "issue" : "issues"} not shown.
      </p>
    {/if}
  {/if}
  <button
    type="button"
    onclick={onRefresh}
    disabled={phase === "indexing"}
  >{phase === "indexing" ? "Indexing…" : "Refresh lore index"}</button>
</details>

<style>
  .lore-index-status {
    margin: 0 0 0.75rem;
    color: #b8b8b8;
    font-size: 0.76rem;
  }

  summary {
    padding: 0.3rem 0;
    color: #d4d4d4;
    font-weight: 600;
    cursor: pointer;
  }

  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  p {
    margin: 0.35rem 0;
    line-height: 1.35;
  }

  ul {
    margin: 0.35rem 0;
    padding-left: 1.1rem;
  }

  li {
    margin-bottom: 0.3rem;
    overflow-wrap: anywhere;
  }

  button {
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.35rem;
    padding: 0.38rem 0.45rem;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #333333;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .lore-index-error {
    color: #f6a5a5;
  }
</style>
