<script lang="ts">
  import { onMount } from "svelte";
  import type { StructuredNoteDestination } from "$lib/project/note-destination";
  import type { StructuredNoteType } from "$lib/project/structured-note";
  import { GUIDED_LORE_FORMS, GUIDED_LORE_TYPES, MAX_GUIDED_LORE_ANSWER_LENGTH } from "./guided-lore";

  let { type, title, answers, fileName, destination, destinations, busy = false, error = "", onType, onTitle, onAnswer, onFileName, onDestination, onConfirm, onCancel } = $props<{
    type: StructuredNoteType;
    title: string;
    answers: Readonly<Record<string, string>>;
    fileName: string;
    destination: string;
    destinations: readonly StructuredNoteDestination[];
    busy?: boolean;
    error?: string;
    onType: (type: StructuredNoteType) => void;
    onTitle: (title: string) => void;
    onAnswer: (id: string, value: string) => void;
    onFileName: (value: string) => void;
    onDestination: (value: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  }>();

  let dialog: HTMLDivElement;
  const form = $derived(GUIDED_LORE_FORMS[type as keyof typeof GUIDED_LORE_FORMS] ?? GUIDED_LORE_FORMS.character);
  const selectedDestination = $derived(destinations.find((item: StructuredNoteDestination) => item.relativePath === destination));
  onMount(() => dialog?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (current - 1 + focusable.length) % focusable.length : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<div class="backdrop" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="guided-lore-title" tabindex="-1" bind:this={dialog}>
    <form onsubmit={(event) => { event.preventDefault(); onConfirm(); }}>
      <header>
        <p class="eyebrow">ADD TO YOUR WORLD</p>
        <h2 id="guided-lore-title">What are you remembering?</h2>
        <p>Start with what is useful now. Every question is optional, and you can add more later.</p>
      </header>

      <fieldset class="kind-choices" disabled={busy}>
        <legend>Choose the closest fit</legend>
        {#each GUIDED_LORE_TYPES as candidate}
          <label class:chosen={type === candidate}>
            <input type="radio" name="lore-kind" value={candidate} checked={type === candidate} onchange={() => onType(candidate)} />
            <span><strong>{GUIDED_LORE_FORMS[candidate].choice}</strong><small>{GUIDED_LORE_FORMS[candidate].description}</small></span>
          </label>
        {/each}
      </fieldset>

      <section class="questions" aria-live="polite">
        <label for="guided-lore-name">{form.nameLabel}</label>
        <input id="guided-lore-name" value={title} disabled={busy} oninput={(event) => onTitle((event.currentTarget as HTMLInputElement).value)} />
        {#each form.fields as field}
          <label for={`guided-lore-${field.id}`}>{field.label} <span>Optional</span></label>
          <textarea id={`guided-lore-${field.id}`} rows="2" maxlength={MAX_GUIDED_LORE_ANSWER_LENGTH} value={answers[field.id] ?? ""} disabled={busy} placeholder={field.placeholder} oninput={(event) => onAnswer(field.id, (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
        {/each}
      </section>

      <details>
        <summary>File details</summary>
        <div class="file-fields">
          <label for="guided-lore-file">Markdown file name</label>
          <input id="guided-lore-file" value={fileName} disabled={busy} oninput={(event) => onFileName((event.currentTarget as HTMLInputElement).value)} />
          <label for="guided-lore-destination">Project folder</label>
          <select id="guided-lore-destination" value={destination} disabled={busy} onchange={(event) => onDestination((event.currentTarget as HTMLSelectElement).value)}>
            {#each destinations as item}<option value={item.relativePath}>{item.label}</option>{/each}
          </select>
        </div>
      </details>

      <p class="effect"><strong>Creates:</strong> <code>{selectedDestination?.relativePath ? `${selectedDestination.relativePath}/${fileName}` : fileName}</code> as ordinary Markdown.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <footer><button type="button" class="secondary" disabled={busy} onclick={onCancel}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Creating…" : `Create ${form.choice.toLocaleLowerCase()}`}</button></footer>
    </form>
  </div>
</div>

<style>
  .backdrop{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:1.25rem;background:rgb(24 20 16 / 58%)}
  .dialog{box-sizing:border-box;width:min(48rem,100%);max-height:calc(100vh - 2.5rem);overflow:auto;padding:1.35rem;border:1px solid #867968;border-radius:.9rem;background:#fbf7ef;color:#25211d;box-shadow:0 1.25rem 4rem rgb(20 16 12 / 30%)}
  form,header,.questions,.file-fields{display:grid;gap:.7rem} h2,p{margin:0}.eyebrow{font-size:.72rem;font-weight:750;letter-spacing:.12em}.kind-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.45rem;margin:0;padding:.75rem;border:1px solid #cfc5b7;border-radius:.6rem}.kind-choices legend,label{font-weight:700}.kind-choices label{display:flex;gap:.55rem;padding:.55rem;border:1px solid transparent;border-radius:.45rem}.kind-choices label.chosen{border-color:#315e78;background:#edf3f5}.kind-choices small{display:block;margin-top:.12rem;color:#6d645a;font-weight:400}.questions{padding-top:.15rem}.questions label span{color:#6d645a;font-weight:400}input:not([type="radio"]),select,textarea{box-sizing:border-box;width:100%;padding:.65rem .7rem;border:1px solid #867968;border-radius:.45rem;background:#fffdf8;color:inherit;font:inherit}.kind-choices input{flex:0 0 auto;width:auto;margin:.2rem 0 0}textarea{resize:vertical}details{border-top:1px solid #cfc5b7;padding-top:.7rem}summary{cursor:pointer;font-weight:700}.file-fields{padding-top:.7rem}.effect{padding:.75rem;border:1px solid #cfc5b7;border-radius:.5rem;background:#f3ede4}code{overflow-wrap:anywhere}.error{color:#9b2f2f}footer{display:flex;justify-content:flex-end;gap:.65rem}button{padding:.65rem .9rem;border:1px solid #315e78;border-radius:.45rem;background:#315e78;color:#fff;font:inherit;cursor:pointer}.secondary{border-color:#867968;background:transparent;color:#25211d}button:disabled{cursor:default;opacity:.58}button:focus-visible,summary:focus-visible{outline:2px solid #167ac6;outline-offset:2px}@media(max-width:35rem){.backdrop{place-items:stretch;padding:0}.dialog{max-height:100vh;border-radius:0}.kind-choices{grid-template-columns:1fr}}
</style>
