<script lang="ts">
  import type { DailyProgressRecords } from "./daily-ledger";
  import {
    challengeDefaultDates,
    MAX_CHALLENGE_NAME_LENGTH,
    MAX_CHALLENGE_TARGET,
    writingChallengeProgress,
    type WritingChallenge,
    type WritingChallengeDraft,
  } from "./challenge";

  let {
    challenge,
    records,
    todayKey,
    busy,
    error,
    onSave,
    onRemove,
  }: {
    challenge: WritingChallenge | null;
    records: DailyProgressRecords;
    todayKey: string;
    busy: boolean;
    error: string;
    onSave: (draft: WritingChallengeDraft) => Promise<boolean>;
    onRemove: () => Promise<boolean>;
  } = $props();

  let editing = $state(false);
  let confirmingRemove = $state(false);
  let name = $state("");
  let target = $state("50000");
  let validFrom = $state("");
  let validTo = $state("");
  let validationError = $state("");
  const progress = $derived(
    challenge ? writingChallengeProgress(challenge, records, todayKey) : null,
  );

  function formatDate(dateKey: string): string {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(year, month - 1, day, 12));
  }

  function beginEdit() {
    const defaults = challengeDefaultDates();
    name = challenge?.name ?? "";
    target = String(challenge?.target ?? 50_000);
    validFrom = challenge?.validFrom ?? defaults.validFrom;
    validTo = challenge?.validTo ?? defaults.validTo;
    validationError = "";
    confirmingRemove = false;
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    validationError = "";
  }

  async function submit() {
    const numericTarget = Number(target);
    if (!name.trim()) {
      validationError = "Give the challenge a name.";
      return;
    }
    if (
      !/^\d+$/.test(target.trim()) ||
      !Number.isSafeInteger(numericTarget) ||
      numericTarget < 1 ||
      numericTarget > MAX_CHALLENGE_TARGET
    ) {
      validationError = `Enter a whole-word target from 1 to ${MAX_CHALLENGE_TARGET.toLocaleString()}.`;
      return;
    }
    if (!validFrom || !validTo) {
      validationError = "Choose both the first and final day.";
      return;
    }
    if (validFrom > validTo) {
      validationError = "The final day cannot be before the first day.";
      return;
    }
    validationError = "";
    if (await onSave({ name, target: numericTarget, validFrom, validTo })) {
      editing = false;
    }
  }

  function statusText(): string {
    if (!challenge || !progress) return "";
    if (progress.status === "complete") return "Challenge reached. The words remain part of your history.";
    if (progress.status === "upcoming") {
      return `Begins ${formatDate(challenge.validFrom)} · ${progress.availableDays} ${progress.availableDays === 1 ? "day" : "days"} available`;
    }
    if (progress.status === "ended") return "This window has ended. Everything you wrote still counts in your history.";
    return `${progress.participatedDays} ${progress.participatedDays === 1 ? "writing day" : "writing days"} so far`;
  }
</script>

<details class="challenge" open={editing || Boolean(challenge)}>
  <summary>Writing challenge</summary>
  <div class="challenge-content">
    {#if editing}
      <form
        aria-label={challenge ? "Edit writing challenge" : "Create writing challenge"}
        onsubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <label>
          Challenge name
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={name} maxlength={MAX_CHALLENGE_NAME_LENGTH} disabled={busy} autofocus />
        </label>
        <label>
          Total word target
          <input
            type="number"
            min="1"
            max={MAX_CHALLENGE_TARGET}
            step="1"
            value={target}
            oninput={(event) => (target = (event.currentTarget as HTMLInputElement).value)}
            disabled={busy}
          />
        </label>
        <div class="date-fields">
          <label>First day <input type="date" bind:value={validFrom} disabled={busy} /></label>
          <label>Final day <input type="date" bind:value={validTo} disabled={busy} /></label>
        </div>
        <p class="field-help">The final day is included. This challenge reads your existing daily totals; it does not change your personal daily goal.</p>
        {#if validationError || error}<p class="error" role="alert">{validationError || error}</p>{/if}
        <div class="actions">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : challenge ? "Save changes" : "Create challenge"}</button>
          <button type="button" class="quiet" onclick={cancelEdit} disabled={busy}>Cancel</button>
        </div>
      </form>
    {:else if challenge && progress}
      <div class="challenge-heading">
        <strong>{challenge.name}</strong>
        <button type="button" class="link" onclick={beginEdit} disabled={busy}>Edit</button>
      </div>
      <p class="dates">{formatDate(challenge.validFrom)} – {formatDate(challenge.validTo)}</p>
      <p class="total">{progress.creditedWords.toLocaleString()} / {challenge.target.toLocaleString()} words</p>
      <progress max={challenge.target} value={Math.min(progress.creditedWords, challenge.target)} aria-label={`${progress.creditedWords} of ${challenge.target} challenge words`}></progress>
      <p class="status" class:complete={progress.status === "complete"}>{statusText()}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if confirmingRemove}
        <div class="remove-confirmation" role="group" aria-label="Remove writing challenge">
          <span>Remove this challenge? Daily history will stay untouched.</span>
          <button type="button" class="danger" onclick={() => void onRemove()} disabled={busy}>{busy ? "Removing…" : "Remove"}</button>
          <button type="button" class="quiet" onclick={() => (confirmingRemove = false)} disabled={busy}>Keep it</button>
        </div>
      {:else}
        <button type="button" class="link remove-link" onclick={() => (confirmingRemove = true)} disabled={busy}>Remove challenge</button>
      {/if}
    {:else}
      <p class="empty">Your daily goal is your everyday rhythm. Add an optional challenge when you want a separate total and a date window.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button type="button" class="add" onclick={beginEdit} disabled={busy}>Add a challenge</button>
    {/if}
  </div>
</details>

<style>
  .challenge {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #3c3c3c;
    color: #b8b8b8;
    font-size: 0.78rem;
  }
  summary { padding: 0.25rem 0; color: #d4d4d4; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
  .challenge-content { display: grid; gap: 0.45rem; padding: 0.55rem 0 0 1rem; }
  form, label { display: grid; gap: 0.3rem; }
  form { gap: 0.65rem; }
  .date-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
  input { box-sizing: border-box; width: 100%; min-width: 0; padding: 0.4rem 0.45rem; border: 1px solid #4b4b4b; border-radius: 4px; background: #1e1e1e; color: #d4d4d4; font: inherit; }
  .challenge-heading { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
  .dates, .status, .field-help, .empty { margin: 0; color: #919191; line-height: 1.45; }
  .field-help { font-size: 0.7rem; }
  .total { margin: 0.15rem 0 0; color: #d4d4d4; font-size: 0.9rem; }
  progress { width: 100%; accent-color: #73a47c; }
  .complete { color: #a7d7ad; }
  .actions, .remove-confirmation { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
  button { padding: 0.35rem 0.55rem; border: 1px solid #555; border-radius: 4px; background: #333; color: #d4d4d4; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #414141; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  button:disabled { opacity: 0.55; cursor: default; }
  .quiet, .link { border: 0; background: transparent; color: #75beff; padding: 0; }
  .remove-link { justify-self: start; margin-top: 0.25rem; color: #b5a19a; }
  .danger { border-color: #855; color: #f2b8aa; }
  .remove-confirmation { color: #b8b8b8; line-height: 1.4; }
  .error { margin: 0; color: #f48771; line-height: 1.4; }
  @media (max-width: 760px) { .date-fields { grid-template-columns: 1fr; } }
</style>
