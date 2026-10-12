<script lang="ts">
  import { onMount } from "svelte";
  import type { StructuredNoteDestination } from "$lib/project/note-destination";
  import type { TimelineCalendar } from "$lib/timeline/format";
  import {
    GUIDED_TIMELINE_ANCHORS,
    type GuidedTimelineAnchorKey,
    type GuidedTimelineAnchorProgress,
    type GuidedTimelineDateDraft,
    type GuidedTimelineDateKind,
    type GuidedTimelinePreviewDisplay,
  } from "./guided-timeline";

  let {
    phase,
    anchors,
    destinations,
    calendars,
    busy = false,
    error = "",
    preview = null,
    onCreate,
    onSkip,
    onBeginDates,
    onLeaveUnknown,
    onPreviewDate,
    onClearPreview,
    onConfirmDate,
    onFinish,
    onClose,
  } = $props<{
    phase: "events" | "dates";
    anchors: readonly GuidedTimelineAnchorProgress[];
    destinations: readonly StructuredNoteDestination[];
    calendars: readonly TimelineCalendar[];
    busy?: boolean;
    error?: string;
    preview?: GuidedTimelinePreviewDisplay | null;
    onCreate: (key: GuidedTimelineAnchorKey, title: string, summary: string, fileName: string, destination: string) => Promise<boolean>;
    onSkip: (key: GuidedTimelineAnchorKey) => void;
    onBeginDates: () => void;
    onLeaveUnknown: (key: GuidedTimelineAnchorKey) => void;
    onPreviewDate: (key: GuidedTimelineAnchorKey, draft: GuidedTimelineDateDraft) => void;
    onClearPreview: () => void;
    onConfirmDate: () => void;
    onFinish: () => void;
    onClose: () => void;
  }>();

  let dialog: HTMLDivElement;
  let editingAnchor = $state<GuidedTimelineAnchorKey | null>(null);
  let title = $state("");
  let summary = $state("");
  let fileName = $state("");
  let destination = $state("");
  let dateAnchor = $state<GuidedTimelineAnchorKey | null>(null);
  let dateKind = $state<GuidedTimelineDateKind>("exact");
  let calendar = $state("gregorian");
  let expression = $state("");

  const allEventsDecided = $derived(anchors.every(({ status }: GuidedTimelineAnchorProgress) => status !== "pending"));
  const createdCount = $derived(anchors.filter(({ status }: GuidedTimelineAnchorProgress) => status === "created").length);
  const allDatesDecided = $derived(
    anchors.filter(({ status }: GuidedTimelineAnchorProgress) => status === "created").every(({ dateStatus }: GuidedTimelineAnchorProgress) => dateStatus !== "pending"),
  );
  const selectedDestination = $derived(destinations.find((item: StructuredNoteDestination) => item.relativePath === destination));

  onMount(() => dialog?.focus());

  function anchor(key: GuidedTimelineAnchorKey) {
    return GUIDED_TIMELINE_ANCHORS.find((candidate) => candidate.key === key)!;
  }

  function suggestedFileName(value: string): string {
    const stem = value.normalize("NFKD").replace(/\p{Mark}/gu, "").toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
    return `${stem || "event"}.md`;
  }

  function beginEvent(key: GuidedTimelineAnchorKey): void {
    editingAnchor = key;
    title = "";
    summary = "";
    fileName = "event.md";
    destination = destinations[0]?.relativePath ?? "";
  }

  function changeTitle(value: string): void {
    const untouched = fileName === "event.md" || fileName === suggestedFileName(title);
    title = value;
    if (untouched) fileName = suggestedFileName(value);
  }

  async function createEvent(): Promise<void> {
    if (!editingAnchor) return;
    if (await onCreate(editingAnchor, title, summary, fileName, destination)) {
      editingAnchor = null;
    }
  }

  function beginDate(key: GuidedTimelineAnchorKey): void {
    dateAnchor = key;
    dateKind = "exact";
    calendar = "gregorian";
    expression = "";
    onClearPreview();
  }

  function dateDraft(): GuidedTimelineDateDraft {
    return { kind: dateKind, calendar, expression };
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      if (preview) onClearPreview();
      else if (editingAnchor) editingAnchor = null;
      else if (dateAnchor) dateAnchor = null;
      else onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (current - 1 + focusable.length) % focusable.length : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<div class="backdrop" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="timeline-guide-title" tabindex="-1" bind:this={dialog}>
    <header>
      <p class="eyebrow">BUILD YOUR FIRST TIMELINE</p>
      <h2 id="timeline-guide-title">{phase === "events" ? "Begin with three useful moments" : "When do these moments happen?"}</h2>
      <p>{phase === "events" ? "Create only the anchors that help. Each one is an ordinary event note and remains useful even if you stop here." : "Add a date only where it helps. Each change is previewed and written to that event note; unknown dates stay visible in Needs time."}</p>
    </header>

    {#if phase === "events"}
      <ol class="anchors">
        {#each GUIDED_TIMELINE_ANCHORS as definition}
          {@const progress = anchors.find(({ key }: GuidedTimelineAnchorProgress) => key === definition.key)!}
          <li class:done={progress.status !== "pending"}>
            <div><p class="eyebrow">{definition.eyebrow}</p><h3>{definition.title}</h3><p>{definition.description}</p></div>
            {#if progress.status === "created"}
              <div class="result"><strong>{progress.title}</strong><code>{progress.path}</code><span>Event note created</span></div>
            {:else if progress.status === "skipped"}
              <span class="status">Skipped for now</span>
            {:else}
              <div class="row"><button type="button" onclick={() => beginEvent(definition.key)} disabled={busy}>Create this event</button><button type="button" class="quiet" onclick={() => onSkip(definition.key)} disabled={busy}>Skip</button></div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if editingAnchor}
        {@const definition = anchor(editingAnchor)}
        <form class="editor" onsubmit={(event) => { event.preventDefault(); void createEvent(); }}>
          <h3>{definition.title}</h3>
          <label for="timeline-event-title">{definition.namePrompt}</label>
          <input id="timeline-event-title" value={title} disabled={busy} oninput={(event) => changeTitle((event.currentTarget as HTMLInputElement).value)} />
          <label for="timeline-event-summary">{definition.summaryPrompt} <span>Optional</span></label>
          <textarea id="timeline-event-summary" rows="3" maxlength="2000" value={summary} disabled={busy} oninput={(event) => summary = (event.currentTarget as HTMLTextAreaElement).value}></textarea>
          <div class="file-row"><div><label for="timeline-event-file">Markdown file name</label><input id="timeline-event-file" value={fileName} disabled={busy} oninput={(event) => fileName = (event.currentTarget as HTMLInputElement).value} /></div><div><label for="timeline-event-folder">Project folder</label><select id="timeline-event-folder" value={destination} disabled={busy} onchange={(event) => destination = (event.currentTarget as HTMLSelectElement).value}>{#each destinations as item}<option value={item.relativePath}>{item.label}</option>{/each}</select></div></div>
          <p class="effect"><strong>Creates:</strong> <code>{selectedDestination?.relativePath ? `${selectedDestination.relativePath}/${fileName}` : fileName}</code>. It does not change another note or the shared timeline file.</p>
          <div class="row end"><button type="button" class="quiet" disabled={busy} onclick={() => editingAnchor = null}>Back</button><button type="submit" disabled={busy}>{busy ? "Creating…" : "Create event note"}</button></div>
        </form>
      {/if}
    {:else}
      <ol class="anchors dates">
        {#each anchors.filter(({ status }: GuidedTimelineAnchorProgress) => status === "created") as progress}
          <li class:done={progress.dateStatus !== "pending"}>
            <div><h3>{progress.title}</h3><code>{progress.path}</code></div>
            {#if progress.dateStatus === "linked"}<span class="status">Date added</span>
            {:else if progress.dateStatus === "unknown"}<span class="status">Date left unknown</span>
            {:else}<div class="row"><button type="button" onclick={() => beginDate(progress.key)} disabled={busy}>Add a date</button><button type="button" class="quiet" onclick={() => onLeaveUnknown(progress.key)} disabled={busy}>I don't know yet</button></div>{/if}
          </li>
        {/each}
      </ol>
      {#if dateAnchor}
        <form class="editor" onsubmit={(event) => { event.preventDefault(); onPreviewDate(dateAnchor!, dateDraft()); }}>
          <h3>Add a date to {anchors.find(({ key }: GuidedTimelineAnchorProgress) => key === dateAnchor)?.title}</h3>
          <fieldset disabled={busy}><legend>What kind of date is this?</legend><label><input type="radio" name="date-kind" checked={dateKind === "exact"} onchange={() => { dateKind = "exact"; onClearPreview(); }} /> Exact Gregorian</label><label><input type="radio" name="date-kind" checked={dateKind === "approximate"} onchange={() => { dateKind = "approximate"; onClearPreview(); }} /> Approximate Gregorian</label><label><input type="radio" name="date-kind" checked={dateKind === "fictional"} onchange={() => { dateKind = "fictional"; calendar = calendars[0]?.id ?? ""; onClearPreview(); }} /> Fictional calendar</label></fieldset>
          {#if dateKind === "fictional"}
            <label for="timeline-calendar">Calendar ID</label>
            <input id="timeline-calendar" list="timeline-calendar-options" value={calendar} placeholder="for example: imperial" disabled={busy} oninput={(event) => { calendar = (event.currentTarget as HTMLInputElement).value; onClearPreview(); }} />
            <datalist id="timeline-calendar-options">{#each calendars as item}<option value={item.id}>{item.title}</option>{/each}</datalist>
          {/if}
          <label for="timeline-expression">{dateKind === "fictional" ? "Date as this calendar writes it" : "Date or useful precision"}</label>
          <input id="timeline-expression" value={expression} placeholder={dateKind === "fictional" ? "12 Frostwane 88" : "2041-04-08, 2041-04, or 2041"} disabled={busy} oninput={(event) => { expression = (event.currentTarget as HTMLInputElement).value; onClearPreview(); }} />
          <p class="hint">ME preserves exactly what you write. A known custom calendar can be sorted; an unknown one remains source-linked without pretending to understand it.</p>
          <div class="row end"><button type="button" class="quiet" disabled={busy} onclick={() => { dateAnchor = null; onClearPreview(); }}>Back</button><button type="submit" disabled={busy}>Preview note change</button></div>
        </form>
      {/if}
    {/if}

    {#if preview}
      <section class="preview" aria-labelledby="timeline-preview-heading">
        <p class="eyebrow">EXACT SOURCE PREVIEW · FROM LINE {preview.firstLine}</p>
        <h3 id="timeline-preview-heading">Only this event note will change</h3>
        <div class="diff"><div><strong>Before</strong><pre>{preview.before || "(no continuity facts yet)"}</pre></div><div><strong>After</strong><pre>{preview.after}</pre></div></div>
        <div class="row end"><button type="button" class="quiet" disabled={busy} onclick={onClearPreview}>Revise</button><button type="button" disabled={busy} onclick={onConfirmDate}>{busy ? "Adding…" : "Add this date"}</button></div>
      </section>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer><button type="button" class="quiet" disabled={busy} onclick={onClose}>Close guide</button>{#if phase === "events"}<button type="button" disabled={!allEventsDecided || createdCount === 0 || busy} onclick={onBeginDates}>Review dates</button>{:else}<button type="button" disabled={!allDatesDecided || busy} onclick={onFinish}>Open timeline</button>{/if}</footer>
  </div>
</div>

<style>
  .backdrop{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:1.25rem;background:rgb(24 20 16 / 58%)}.dialog{box-sizing:border-box;width:min(54rem,100%);max-height:calc(100vh - 2.5rem);overflow:auto;padding:1.35rem;border:1px solid #867968;border-radius:.9rem;background:#fbf7ef;color:#25211d;box-shadow:0 1.25rem 4rem rgb(20 16 12 / 30%)}header,.editor{display:grid;gap:.7rem}h2,h3,p{margin:0}.eyebrow{font-size:.72rem;font-weight:750;letter-spacing:.12em}.anchors{display:grid;gap:.65rem;margin:1rem 0;padding:0;list-style:none}.anchors>li{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem;border:1px solid #cfc5b7;border-radius:.6rem;background:#fffdf8}.anchors>li.done{background:#f0f3ee}.anchors h3{margin:.12rem 0}.result{display:grid;justify-items:end;gap:.12rem;text-align:right}.result code,.dates code{overflow-wrap:anywhere;color:#655c52}.status{font-weight:700;color:#315e78}.row{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}.end{justify-content:flex-end}.editor,.preview{margin:1rem 0;padding:1rem;border:1px solid #9e907e;border-radius:.65rem;background:#f3ede4}.editor label,.editor legend{font-weight:700}.editor label span,.hint{color:#6d645a;font-weight:400}.file-row,.diff{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.file-row>div{display:grid;gap:.35rem}input:not([type="radio"]),select,textarea{box-sizing:border-box;width:100%;padding:.65rem .7rem;border:1px solid #867968;border-radius:.45rem;background:#fffdf8;color:inherit;font:inherit}textarea{resize:vertical}fieldset{display:flex;gap:.8rem;flex-wrap:wrap;margin:0;padding:.7rem;border:1px solid #cfc5b7;border-radius:.5rem}.effect{padding:.7rem;border:1px solid #cfc5b7;border-radius:.5rem;background:#fffdf8}.preview{display:grid;gap:.7rem}.diff pre{max-height:14rem;overflow:auto;white-space:pre-wrap;padding:.65rem;border:1px solid #cfc5b7;border-radius:.4rem;background:#fffdf8}footer{display:flex;justify-content:space-between;gap:.65rem;padding-top:.9rem;border-top:1px solid #cfc5b7}button{padding:.62rem .85rem;border:1px solid #315e78;border-radius:.45rem;background:#315e78;color:#fff;font:inherit;cursor:pointer}.quiet{border-color:#867968;background:transparent;color:#25211d}button:disabled{cursor:default;opacity:.5}.error{margin:.7rem 0;color:#9b2f2f}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #167ac6;outline-offset:2px}@media(max-width:40rem){.backdrop{place-items:stretch;padding:0}.dialog{max-height:100vh;border-radius:0}.anchors>li{align-items:flex-start;flex-direction:column}.result{justify-items:start;text-align:left}.file-row,.diff{grid-template-columns:1fr}}
</style>
