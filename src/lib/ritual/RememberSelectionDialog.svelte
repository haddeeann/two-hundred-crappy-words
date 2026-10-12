<script lang="ts">
  import { onMount } from "svelte";
  import {
    STRUCTURED_NOTE_TEMPLATES,
    STRUCTURED_NOTE_TYPES,
    type StructuredNoteType,
  } from "$lib/project/structured-note";
  import type { StructuredNoteDestination } from "$lib/project/note-destination";
  import {
    MAX_REMEMBER_CONSISTENCY_LENGTH,
    MAX_REMEMBER_SUMMARY_LENGTH,
    type RememberSelectionSnapshot,
  } from "./remember-selection";

  let {
    snapshot,
    type,
    title,
    summary,
    consistency,
    fileName,
    destination,
    destinations,
    busy = false,
    error = "",
    onType,
    onTitle,
    onSummary,
    onConsistency,
    onFileName,
    onDestination,
    onConfirm,
    onCancel,
  }: {
    snapshot: RememberSelectionSnapshot;
    type: StructuredNoteType;
    title: string;
    summary: string;
    consistency: string;
    fileName: string;
    destination: string;
    destinations: readonly StructuredNoteDestination[];
    busy?: boolean;
    error?: string;
    onType: (type: StructuredNoteType) => void;
    onTitle: (title: string) => void;
    onSummary: (summary: string) => void;
    onConsistency: (consistency: string) => void;
    onFileName: (fileName: string) => void;
    onDestination: (destination: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  const selectedDestination = $derived(
    destinations.find((candidate) => candidate.relativePath === destination),
  );
  let nameInput: HTMLInputElement;
  let dialog: HTMLDivElement;

  onMount(() => nameInput?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current - 1 + focusable.length) % focusable.length
      : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="remember-backdrop" role="presentation">
  <div
    class="remember-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="remember-title"
    tabindex="-1"
    bind:this={dialog}
  >
    <form
      class="remember-form"
      onsubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
    >
    <header>
      <p class="eyebrow">REMEMBER FROM WRITING</p>
      <h2 id="remember-title">What should this become?</h2>
      <p>ME will create one ordinary Markdown note. Your source words will stay exactly where they are.</p>
    </header>

    <section class="source-preview" aria-labelledby="remember-source-label">
      <div>
        <strong id="remember-source-label">Selected in {snapshot.sourcePath}</strong>
        <span>{snapshot.selectedText.length.toLocaleString()} characters</span>
      </div>
      <blockquote>{snapshot.selectedText}</blockquote>
    </section>

    <label for="remember-kind">This is…</label>
    <select
      id="remember-kind"
      value={type}
      disabled={busy}
      onchange={(event) => onType((event.currentTarget as HTMLSelectElement).value as StructuredNoteType)}
    >
      {#each STRUCTURED_NOTE_TYPES.filter((candidate) => candidate !== "scene" && candidate !== "chapter") as candidate}
        <option value={candidate}>{STRUCTURED_NOTE_TEMPLATES[candidate].label}</option>
      {/each}
    </select>

    <label for="remember-name">Name</label>
    <input
      id="remember-name"
      value={title}
      disabled={busy}
      bind:this={nameInput}
      oninput={(event) => onTitle((event.currentTarget as HTMLInputElement).value)}
    />

    <label for="remember-summary">What is it here? <span>Optional</span></label>
    <textarea
      id="remember-summary"
      rows="3"
      maxlength={MAX_REMEMBER_SUMMARY_LENGTH}
      value={summary}
      disabled={busy}
      placeholder="A sentence or two is enough."
      oninput={(event) => onSummary((event.currentTarget as HTMLTextAreaElement).value)}
    ></textarea>

    <label for="remember-consistency">One thing to keep consistent <span>Optional</span></label>
    <textarea
      id="remember-consistency"
      rows="2"
      maxlength={MAX_REMEMBER_CONSISTENCY_LENGTH}
      value={consistency}
      disabled={busy}
      placeholder="A fact future scenes should not contradict."
      oninput={(event) => onConsistency((event.currentTarget as HTMLTextAreaElement).value)}
    ></textarea>

    <details>
      <summary>File details</summary>
      <div class="file-fields">
        <label for="remember-file">Markdown file name</label>
        <input
          id="remember-file"
          value={fileName}
          disabled={busy}
          oninput={(event) => onFileName((event.currentTarget as HTMLInputElement).value)}
        />
        <label for="remember-destination">Project folder</label>
        <select
          id="remember-destination"
          value={destination}
          disabled={busy}
          onchange={(event) => onDestination((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each destinations as candidate}
            <option value={candidate.relativePath}>{candidate.label}</option>
          {/each}
        </select>
      </div>
    </details>

    <p class="effect-preview">
      <strong>On save:</strong> create
      <code>{selectedDestination?.relativePath ? `${selectedDestination.relativePath}/${fileName}` : fileName}</code>.
      Do not edit or link <code>{snapshot.sourcePath}</code>.
    </p>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <footer>
      <button type="button" class="secondary" disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="submit" disabled={busy}>{busy ? "Checking and saving…" : "Save new note"}</button>
    </footer>
    </form>
  </div>
</div>

<style>
  .remember-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: rgb(24 20 16 / 54%);
  }

  .remember-dialog {
    width: min(38rem, 100%);
    max-height: calc(100vh - 2.5rem);
    overflow: auto;
    padding: 1.35rem;
    border: 1px solid var(--line-strong, #867968);
    border-radius: 0.9rem;
    background: var(--panel, #fbf7ef);
    color: var(--text, #25211d);
    box-shadow: 0 1.25rem 4rem rgb(20 16 12 / 28%);
  }

  .remember-form {
    display: grid;
    gap: 0.7rem;
  }

  header h2,
  header p,
  .effect-preview {
    margin: 0;
  }

  header {
    display: grid;
    gap: 0.35rem;
  }

  .eyebrow {
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.12em;
  }

  label {
    font-weight: 700;
  }

  label span {
    font-weight: 400;
    color: var(--muted, #6d645a);
  }

  input,
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 0.65rem 0.7rem;
    border: 1px solid var(--line-strong, #867968);
    border-radius: 0.45rem;
    background: var(--surface, #fffdf8);
    color: inherit;
    font: inherit;
  }

  textarea {
    resize: vertical;
  }

  .source-preview,
  .effect-preview {
    padding: 0.8rem;
    border: 1px solid var(--line, #cfc5b7);
    border-radius: 0.55rem;
    background: var(--surface-subtle, #f3ede4);
  }

  .source-preview > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.82rem;
  }

  .source-preview span {
    color: var(--muted, #6d645a);
  }

  blockquote {
    max-height: 7rem;
    overflow: auto;
    margin: 0.6rem 0 0;
    padding-left: 0.8rem;
    border-left: 3px solid var(--accent, #315e78);
    white-space: pre-wrap;
  }

  details {
    border-top: 1px solid var(--line, #cfc5b7);
    padding-top: 0.7rem;
  }

  summary {
    cursor: pointer;
    font-weight: 700;
  }

  .file-fields {
    display: grid;
    gap: 0.55rem;
    padding-top: 0.7rem;
  }

  code {
    overflow-wrap: anywhere;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.65rem;
    padding-top: 0.2rem;
  }

  button {
    padding: 0.65rem 0.9rem;
    border: 1px solid #315e78;
    border-radius: 0.45rem;
    background: #315e78;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }

  .secondary {
    border-color: #867968;
    background: transparent;
    color: #25211d;
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #167ac6;
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.58;
  }

  .error {
    margin: 0;
    color: var(--error, #9b2f2f);
  }

  @media (max-width: 35rem) {
    .remember-backdrop {
      place-items: stretch;
      padding: 0;
    }

    .remember-dialog {
      max-height: 100vh;
      border-radius: 0;
    }
  }
</style>
