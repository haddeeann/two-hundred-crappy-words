<script lang="ts">
  import type { DailyProgressRecords } from "./daily-ledger";
  import { parseCorrectedWords } from "./correction";
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
    onCorrect,
  }: {
    records: DailyProgressRecords;
    todayKey: string;
    onCorrect: (dateKey: string, correctedWords: number) => Promise<boolean>;
  } = $props();

  let visibleDays = $state(INITIAL_VISIBLE_DAYS);
  let editingDateKey = $state("");
  let correctionInput = $state("");
  let correctionError = $state("");
  let correcting = $state(false);
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

  function startCorrection(dateKey: string, creditedWords: number) {
    editingDateKey = dateKey;
    correctionInput = String(creditedWords);
    correctionError = "";
  }

  function cancelCorrection() {
    editingDateKey = "";
    correctionInput = "";
    correctionError = "";
  }

  async function confirmCorrection() {
    if (!editingDateKey || correcting) return;
    const correctedWords = parseCorrectedWords(correctionInput);
    if (correctedWords === null) {
      correctionError = "Enter a whole number of zero or more.";
      return;
    }

    correcting = true;
    const stored = await onCorrect(editingDateKey, correctedWords);
    correcting = false;
    if (stored) cancelCorrection();
  }

  function correctionKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmCorrection();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCorrection();
    }
  }
</script>

<details class="practice-history">
  <summary>Writing history</summary>
  <div class="history-content">
    <p class="rhythm">{formatStreakSummary(streakSummary)}</p>
    <p class="history-help">
      Progress uses this Mac's local date. Opening or recovering a file won't recount its existing words.
    </p>

    {#if history.length === 0}
      <p class="empty-history">Your recorded writing days will gather here.</p>
    {:else}
      <ol aria-label="Recorded writing days">
        {#each visibleHistory as entry (entry.dateKey)}
          <li>
            <div class="history-row">
              <time datetime={entry.dateKey}>{formatDate(entry.dateKey)}</time>
              <span class:completed={entry.completed}>
                {entry.creditedWords} / {entry.target}
                {#if entry.completed}<span class="reached" aria-label="Goal reached">✓</span>{/if}
              </span>
            </div>
            {#if editingDateKey === entry.dateKey}
              <div class="correction-editor">
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="number"
                  min="0"
                  step="1"
                  aria-label={`Correct words for ${formatDate(entry.dateKey)}`}
                  value={correctionInput}
                  oninput={(event) =>
                    (correctionInput = (
                      event.currentTarget as HTMLInputElement
                    ).value)}
                  onkeydown={correctionKeydown}
                  disabled={correcting}
                  autofocus
                />
                <button type="button" onclick={() => void confirmCorrection()} disabled={correcting}>Save</button>
                <button type="button" onclick={cancelCorrection} disabled={correcting}>Cancel</button>
              </div>
              {#if correctionError}
                <span class="correction-error" role="alert">{correctionError}</span>
              {/if}
            {:else}
              <div class="history-note">
                {#if entry.correctionCount > 0}
                  <span>{entry.correctionCount === 1 ? "Corrected once" : `Corrected ${entry.correctionCount} times`}</span>
                {/if}
                <button
                  type="button"
                  class="correct-button"
                  aria-label={`Correct writing total for ${formatDate(entry.dateKey)}`}
                  onclick={() => startCorrection(entry.dateKey, entry.creditedWords)}
                >Correct</button>
              </div>
            {/if}
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
  button:focus-visible,
  input:focus-visible {
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

  .history-help {
    margin: 0 0 0.65rem;
    color: #858585;
    font-size: 0.7rem;
    line-height: 1.4;
  }

  ol {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: 0.18rem;
  }

  .history-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .history-note {
    min-height: 1rem;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    color: #858585;
    font-size: 0.7rem;
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

  .correct-button,
  .correction-editor button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #75beff;
    font: inherit;
    cursor: pointer;
  }

  .correct-button {
    margin-left: auto;
  }

  .correction-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.4rem;
  }

  .correction-editor input {
    box-sizing: border-box;
    min-width: 0;
    height: 24px;
    padding: 0 0.3rem;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background-color: #1e1e1e;
    color: #d4d4d4;
    font: inherit;
  }

  .correction-editor button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .correction-error {
    color: #f48771;
    font-size: 0.7rem;
    line-height: 1.35;
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
