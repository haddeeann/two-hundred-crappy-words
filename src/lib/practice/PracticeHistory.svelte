<script lang="ts">
  import type { DailyProgressRecords } from "./daily-ledger";
  import {
    createWritingHistory,
    formatStreakSummary,
    summarizeStreaks,
  } from "./history";

  const INITIAL_VISIBLE_DAYS = 7;
  const MORE_VISIBLE_DAYS = 30;

  let {
    records,
    todayKey,
  }: {
    records: DailyProgressRecords;
    todayKey: string;
  } = $props();

  let visibleDays = $state(INITIAL_VISIBLE_DAYS);
  const history = $derived(createWritingHistory(records));
  const visibleHistory = $derived(history.slice(0, visibleDays));
  const streakSummary = $derived(summarizeStreaks(records, todayKey));

  function formatDate(dateKey: string): string {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: year === new Date().getFullYear() ? undefined : "numeric",
    }).format(date);
  }
</script>

<details class="practice-history">
  <summary>Writing history</summary>
  <div class="history-content">
    <p class="rhythm">{formatStreakSummary(streakSummary)}</p>

    {#if history.length === 0}
      <p class="empty-history">Your recorded writing days will gather here.</p>
    {:else}
      <ol aria-label="Recorded writing days">
        {#each visibleHistory as entry (entry.dateKey)}
          <li>
            <time datetime={entry.dateKey}>{formatDate(entry.dateKey)}</time>
            <span class:completed={entry.completed}>
              {entry.creditedWords} / {entry.target}
              {#if entry.completed}<span class="reached" aria-label="Goal reached">✓</span>{/if}
            </span>
          </li>
        {/each}
      </ol>

      {#if visibleHistory.length < history.length}
        <button
          type="button"
          class="show-earlier"
          onclick={() => (visibleDays += MORE_VISIBLE_DAYS)}
        >Show earlier days</button>
      {/if}
    {/if}
  </div>
</details>

<style>
  .practice-history {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #3c3c3c;
    color: #b8b8b8;
    font-size: 0.78rem;
  }

  summary {
    padding: 0.25rem 0;
    color: #d4d4d4;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  summary:focus-visible,
  .show-earlier:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .history-content {
    padding: 0.45rem 0 0 1rem;
  }

  .rhythm {
    margin: 0 0 0.6rem;
    color: #a7d7ad;
  }

  .empty-history {
    margin: 0;
    line-height: 1.45;
    color: #a0a0a0;
  }

  ol {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  time {
    color: #a0a0a0;
  }

  .completed {
    color: #d4d4d4;
  }

  .reached {
    margin-left: 0.2rem;
    color: #a7d7ad;
  }

  .show-earlier {
    margin: 0.65rem 0 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: #75beff;
    font: inherit;
    cursor: pointer;
  }

  .show-earlier:hover {
    text-decoration: underline;
  }
</style>
