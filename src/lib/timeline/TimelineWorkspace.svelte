<script lang="ts">
  import type { SourceRange } from "$lib/lore/types";
  import type { TimelineProjectLoadResult } from "./load";
  import type {
    TimelineCalendarGroup,
    TimelineModel,
    TimelineSubject,
    TimelineTrackModel,
  } from "./model";

  interface Props {
    result: TimelineProjectLoadResult;
    model: TimelineModel;
    loading: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onOpenSource: (path: string, range: SourceRange | null) => void;
  }

  let { result, model, loading, onClose, onRefresh, onOpenSource }: Props = $props();

  const subjectById = $derived(
    new Map(model.subjects.map((subject) => [subject.noteId, subject])),
  );
  const loadMessage = $derived(resultMessage(result));

  function subjects(ids: readonly string[]): TimelineSubject[] {
    return ids.flatMap((id) => {
      const subject = subjectById.get(id);
      return subject ? [subject] : [];
    });
  }

  function calendarTitle(group: TimelineCalendarGroup): string {
    if (group.axis === "gregorian") return "Gregorian";
    const id = group.axis.slice("calendar:".length);
    if (result.kind === "ready") {
      return result.timeline.calendars.find((calendar) => calendar.id === id)?.title ?? id;
    }
    return id;
  }

  function writtenTime(subject: TimelineSubject): string {
    if (subject.evidence.length === 0) return "No written date";
    return subject.evidence
      .map((fact) => `${fact.property === "occurs-at" ? "Starts" : "Ends"} ${fact.expression ?? "invalid value"}${fact.calendar && fact.calendar !== "gregorian" ? ` · ${fact.calendar}` : ""}`)
      .join(" · ");
  }

  function resultMessage(value: TimelineProjectLoadResult): string | null {
    if (value.kind === "ready") return null;
    if (value.kind === "absent") {
      return "No shared timeline file. Gregorian facts still form a complete local timeline; custom calendars and tracks can be added in a later editing slice.";
    }
    if (value.kind === "invalid") {
      return `The shared timeline file is invalid: ${value.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")} Gregorian facts remain available, and nothing was changed.`;
    }
    if (value.kind === "malformed") {
      return `The shared timeline file is not valid JSON: ${value.message} Gregorian facts remain available, and nothing was changed.`;
    }
    if (value.kind === "unsupported-version") {
      return `The shared timeline file uses newer version ${value.version}. Gregorian facts remain available, and the file was preserved untouched.`;
    }
    return value.message;
  }
</script>

<section class="timeline-workspace" aria-labelledby="timeline-heading">
  <header>
    <div>
      <p class="eyebrow">Source-linked chronology</p>
      <h1 id="timeline-heading">Timeline</h1>
      <p>Chronological evidence from event, scene, and chapter notes. Narrative order remains separate.</p>
    </div>
    <div class="workspace-actions">
      <button type="button" onclick={onRefresh} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      <button type="button" class="primary" onclick={onClose}>Return to draft</button>
    </div>
  </header>

  {#if loadMessage}
    <p class="load-message" class:problem={result.kind !== "absent"} role={result.kind === "absent" ? "status" : "alert"}>
      {loadMessage}
    </p>
  {:else if result.kind === "ready"}
    <p class="load-message good">
      Shared definitions loaded safely: {result.timeline.calendars.length} custom {result.timeline.calendars.length === 1 ? "calendar" : "calendars"} and {result.timeline.tracks.length} {result.timeline.tracks.length === 1 ? "track" : "tracks"}.
    </p>
  {/if}

  {#if model.calendarGroups.length === 0}
    <section class="empty-panel">
      <h2>Chronology</h2>
      <p>No computable dates yet. Eligible notes remain visible under Needs time.</p>
    </section>
  {:else}
    {#each model.calendarGroups as group (group.axis)}
      <section class="timeline-section" aria-labelledby={`calendar-${group.axis}`}>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Calendar</p>
            <h2 id={`calendar-${group.axis}`}>{calendarTitle(group)}</h2>
          </div>
          <span>{group.subjectIds.length} {group.subjectIds.length === 1 ? "subject" : "subjects"}</span>
        </div>
        <ol class="subject-list chronological">
          {#each subjects(group.subjectIds) as subject (subject.noteId)}
            <li>
              <article class="subject-card">
                <div class="card-heading">
                  <div>
                    <p class="time-label">{writtenTime(subject)}</p>
                    <h3>{subject.title}</h3>
                    <p class="path">{subject.path}</p>
                  </div>
                  <div class="badges">
                    <span>{subject.noteType}</span>
                    {#if subject.noteCanon}<span>{subject.noteCanon}</span>{/if}
                  </div>
                </div>
                {#if subject.trackIds.length > 0}
                  <p class="context"><strong>Tracks:</strong> {subject.trackIds.join(", ")}</p>
                {/if}
                {#if subject.narrative.length > 0}
                  <ul class="context-list" aria-label="Narrative positions">
                    {#each subject.narrative as position}
                      <li>
                        {position.manuscriptTitle} · {position.itemTitle}
                        {position.storyDate ? ` · ${position.storyDate}` : ""}
                      </li>
                    {/each}
                  </ul>
                {/if}
                <div class="evidence" aria-label={`Source evidence for ${subject.title}`}>
                  {#each subject.evidence as fact (fact.id)}
                    <button type="button" onclick={() => onOpenSource(subject.path, fact.range)}>
                      {fact.property} · {fact.expression ?? "invalid"} · {fact.certainty ?? "certainty unspecified"} · line {fact.range.line}
                    </button>
                  {/each}
                </div>
              </article>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {/if}

  <section class="timeline-section" aria-labelledby="needs-time-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Unresolved chronology</p>
        <h2 id="needs-time-heading">Needs time</h2>
      </div>
      <span>{model.needsTimeSubjectIds.length}</span>
    </div>
    {#if model.needsTimeSubjectIds.length === 0}
      <p class="empty">Every eligible note has one computable placement.</p>
    {:else}
      <ul class="subject-list">
        {#each subjects(model.needsTimeSubjectIds) as subject (subject.noteId)}
          <li>
            <article class="subject-card unresolved">
              <div class="card-heading">
                <div>
                  <h3>{subject.title}</h3>
                  <p class="path">{subject.path}</p>
                </div>
                <button type="button" class="open-source" onclick={() => onOpenSource(subject.path, subject.evidence[0]?.range ?? null)}>Open source</button>
              </div>
              <ul class="issue-list">
                {#each subject.issues as issue}
                  <li>{issue.message}</li>
                {/each}
                {#each subject.sourceDiagnostics as diagnostic}
                  <li>
                    <button type="button" onclick={() => onOpenSource(subject.path, diagnostic.range)}>{diagnostic.message} · line {diagnostic.range.line}</button>
                  </li>
                {/each}
              </ul>
              {#if subject.evidence.length > 0}
                <div class="evidence">
                  {#each subject.evidence as fact (fact.id)}
                    <button type="button" onclick={() => onOpenSource(subject.path, fact.range)}>
                      {fact.property} · {fact.expression ?? "invalid"} · line {fact.range.line}
                    </button>
                  {/each}
                </div>
              {/if}
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if model.tracks.length > 0}
    <section class="timeline-section" aria-labelledby="tracks-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Writer-defined order</p>
          <h2 id="tracks-heading">Tracks</h2>
        </div>
        <span>{model.tracks.length}</span>
      </div>
      <div class="track-grid">
        {#each model.tracks as track (track.id)}
          {@render TrackCard({ track, subjectValues: subjects(track.subjectIds), onOpenSource })}
        {/each}
      </div>
      {#if model.unassignedSubjectIds.length > 0}
        <details>
          <summary>{model.unassignedSubjectIds.length} unassigned {model.unassignedSubjectIds.length === 1 ? "subject" : "subjects"}</summary>
          <ul class="compact-list">
            {#each subjects(model.unassignedSubjectIds) as subject (subject.noteId)}
              <li><button type="button" onclick={() => onOpenSource(subject.path, subject.evidence[0]?.range ?? null)}>{subject.title}</button></li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {/if}

  {#if model.excludedSources.length > 0}
    <section class="timeline-section" aria-labelledby="excluded-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Identity required</p>
          <h2 id="excluded-heading">Excluded sources</h2>
        </div>
        <span>{model.excludedSources.length}</span>
      </div>
      <ul class="compact-list">
        {#each model.excludedSources as source (`${source.path}:${source.noteId ?? "missing"}`)}
          <li>
            <button type="button" onclick={() => onOpenSource(source.path, null)}>{source.title}</button>
            <span>{source.reason}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <footer>Derived locally from current project sources. This workspace does not write or award daily words.</footer>
</section>

{#snippet TrackCard({ track, subjectValues, onOpenSource }: { track: TimelineTrackModel; subjectValues: TimelineSubject[]; onOpenSource: Props["onOpenSource"] })}
  <article class="track-card" style={track.color ? `--track-color: ${track.color}` : undefined}>
    <h3>{track.title}</h3>
    <p class="path">{track.id}</p>
    {#if subjectValues.length === 0}
      <p class="empty">No resolved subjects.</p>
    {:else}
      <ol>
        {#each subjectValues as subject (subject.noteId)}
          <li><button type="button" onclick={() => onOpenSource(subject.path, subject.evidence[0]?.range ?? null)}>{subject.title}</button></li>
        {/each}
      </ol>
    {/if}
    {#if track.issues.length > 0}
      <ul class="issue-list">
        {#each track.issues as issue (issue.noteId)}
          <li><code>{issue.noteId}</code>: {issue.message}</li>
        {/each}
      </ul>
    {/if}
  </article>
{/snippet}

<style>
  .timeline-workspace {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    padding: clamp(1rem, 3vw, 2.5rem);
    background: #1e1e1e;
    color: #d4d4d4;
  }

  header,
  .section-heading,
  .card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  header {
    max-width: 76rem;
    margin: 0 auto 1.4rem;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.35rem;
    color: #fff;
    font-size: 1.7rem;
  }

  h2 {
    margin-bottom: 0;
    color: #f0f0f0;
    font-size: 1.05rem;
  }

  h3 {
    margin-bottom: 0.18rem;
    color: #e8e8e8;
    font-size: 0.95rem;
  }

  header p:not(.eyebrow) {
    max-width: 42rem;
    margin-bottom: 0;
    color: #a9a9a9;
    line-height: 1.45;
  }

  .eyebrow,
  .time-label {
    margin-bottom: 0.2rem;
    color: #a7d7ad;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.5rem;
  }

  button {
    padding: 0.35rem 0.55rem;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background: #292929;
    color: #75beff;
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #383838;
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button.primary {
    border-color: #4d6252;
    background: #29322b;
    color: #c7e5cc;
  }

  .load-message,
  .timeline-section,
  .empty-panel {
    box-sizing: border-box;
    max-width: 76rem;
    margin: 0 auto 1rem;
    border: 1px solid #3c3c3c;
    border-radius: 7px;
    background: #242424;
  }

  .load-message {
    padding: 0.75rem 0.9rem;
    color: #b8b8b8;
    line-height: 1.45;
  }

  .load-message.good {
    border-color: #405746;
    color: #b8d8bd;
  }

  .load-message.problem {
    border-color: #765044;
    color: #e1b6a9;
  }

  .timeline-section,
  .empty-panel {
    padding: 1rem;
  }

  .section-heading {
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .section-heading > span,
  .badges span {
    padding: 0.12rem 0.38rem;
    border: 1px solid #4b5e50;
    border-radius: 999px;
    color: #a7d7ad;
    font-size: 0.68rem;
  }

  .subject-list,
  .compact-list,
  .context-list,
  .issue-list,
  .track-card ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .subject-list > li + li {
    margin-top: 0.65rem;
  }

  .subject-list.chronological > li {
    position: relative;
    padding-left: 1.05rem;
    border-left: 2px solid #4d7255;
  }

  .subject-list.chronological > li::before {
    position: absolute;
    left: -0.35rem;
    top: 1rem;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #72a87d;
    content: "";
  }

  .subject-card,
  .track-card {
    padding: 0.8rem;
    border: 1px solid #3f3f3f;
    border-radius: 5px;
    background: #292929;
  }

  .subject-card.unresolved {
    border-color: #5c4e3f;
  }

  .path,
  .context,
  .empty,
  footer {
    color: #9d9d9d;
    font-size: 0.75rem;
  }

  .path {
    margin-bottom: 0;
    overflow-wrap: anywhere;
  }

  .badges {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.3rem;
  }

  .context {
    margin: 0.55rem 0 0;
  }

  .context-list,
  .issue-list {
    margin-top: 0.55rem;
    color: #b8b8b8;
    font-size: 0.75rem;
    line-height: 1.45;
  }

  .evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.65rem;
  }

  .evidence button,
  .issue-list button,
  .compact-list button,
  .track-card li button,
  .open-source {
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }

  .track-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.65rem;
  }

  .track-card {
    border-top: 3px solid var(--track-color, #54755c);
  }

  .track-card ol {
    margin: 0.55rem 0;
  }

  .track-card li + li,
  .compact-list li + li {
    margin-top: 0.35rem;
  }

  details {
    margin-top: 0.8rem;
    color: #b8b8b8;
    font-size: 0.78rem;
  }

  summary {
    cursor: pointer;
  }

  .compact-list {
    margin-top: 0.55rem;
  }

  .compact-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: #aaa;
    font-size: 0.78rem;
  }

  footer {
    max-width: 76rem;
    margin: 1.4rem auto 0;
    text-align: center;
  }

  @media (max-width: 760px) {
    header,
    .card-heading {
      display: block;
    }

    .workspace-actions,
    .badges {
      margin-top: 0.7rem;
      justify-content: flex-start;
    }
  }
</style>
